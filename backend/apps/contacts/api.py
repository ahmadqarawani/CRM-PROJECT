from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from drf_spectacular.utils import OpenApiParameter as P
from drf_spectacular.utils import extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.catalog.models import Source, Tag
from apps.core.serializers import ArchiveFieldMixin, UserRefSerializer, fk, ref
from apps.core.text import normalize_phone
from apps.core.views import BaseViewSet, flag
from apps.realtime.events import Event, publish

from . import services
from .models import Contact, ContactPhone

User = get_user_model()


class PhoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactPhone
        fields = ["number", "has_whatsapp", "label"]
        extra_kwargs = {"number": {"validators": []}}


class ContactSerializer(ArchiveFieldMixin, serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    phones = PhoneSerializer(many=True, required=False)
    source = ref(Source)(read_only=True, allow_null=True)
    source_id = fk(Source, "source")
    assignee = UserRefSerializer(read_only=True, allow_null=True)
    assignee_id = fk(User, "assignee", User.objects.filter(is_active=True))
    tags = ref(Tag, ("id", "name", "color"))(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(source="tags", queryset=Tag.objects.all(), many=True,
                                                 write_only=True, required=False)
    open_deals = serializers.IntegerField(read_only=True, default=0)
    properties_count = serializers.IntegerField(read_only=True, default=0)
    needs_attention = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Contact
        fields = ["id", "name", "display_name", "phones", "source", "source_id", "referred_by", "assignee",
                  "assignee_id", "email", "notes", "tags", "tag_ids", "last_contact_at", "open_deals",
                  "properties_count", "needs_attention", "merged_into", "is_archived", "created_at", "updated_at"]
        read_only_fields = ["last_contact_at", "merged_into", "created_at", "updated_at"]

    @transaction.atomic
    def create(self, data):
        data.pop("is_archived", None)
        phones = data.pop("phones", [])
        tags = data.pop("tags", [])
        contact = services.create_contact(phones=[p["number"] for p in phones], by=self.context["request"].user,
                                          **data)
        if phones:
            services.set_phones(contact, phones)
        contact.tags.set(tags)
        return contact

    @transaction.atomic
    def update(self, instance, data):
        data = self.apply_archive(instance, data)
        phones = data.pop("phones", None)
        instance = super().update(instance, data)
        if phones is not None:
            services.set_phones(instance, phones)
        instance.refresh_search()
        publish(Event.CLIENT_CHANGED, id=instance.pk)
        return instance


@extend_schema_view(list=extend_schema(parameters=[
    P("search", str), P("source", int), P("tag", int), P("assignee", str), P("archived", bool), P("attention", bool),
]))
class ContactViewSet(BaseViewSet):
    serializer_class = ContactSerializer
    ordering_fields = ["created_at", "name", "last_contact_at"]

    def get_queryset(self):
        from apps.deals.models import Deal
        from apps.deals.overdue import with_attention

        attention = with_attention(Deal.objects.filter(contact=OuterRef("pk"))).filter(needs_attention=True)
        qs = (Contact.objects.prefetch_related("phones", "tags").select_related("source", "assignee")
              .annotate(open_deals=Count("deals", filter=Q(deals__stage__type="OPEN", deals__archived_at__isnull=True),
                                         distinct=True),
                        properties_count=Count("properties", filter=Q(properties__archived_at__isnull=True),
                                               distinct=True),
                        needs_attention=Exists(attention))
              .order_by("-created_at"))
        if self.action == "list":
            # merged cards are archived too, but they are gone for good: keep them out of every list
            qs = self.mine(self.archived_filter(qs)).filter(merged_into__isnull=True)
            p = self.request.query_params
            if q := p.get("search"):
                qs = qs.filter(services.search_q(q)).distinct()
            if v := p.get("source"):
                qs = qs.filter(source_id=v)
            if v := p.get("tag"):
                qs = qs.filter(tags=v)
            if flag(self.request, "attention"):
                qs = qs.filter(needs_attention=True)
        return qs

    @extend_schema(parameters=[P("phone", str, required=True)],
                   responses=inline_serializer("PhoneCheck", {"number": serializers.CharField(allow_null=True),
                                                             "contact": serializers.DictField(allow_null=True)}))
    @action(detail=False, methods=["get"], url_path="check-phone")
    def check_phone(self, request):
        """Live duplicate check while typing a number."""
        number = normalize_phone(request.query_params.get("phone"))
        owner = services.owner_of(number) if number else None
        return Response({"number": number,
                         "contact": {"id": owner.pk, "name": owner.display_name} if owner else None})

    @extend_schema(responses=inline_serializer("DuplicatePair", {
        "a": serializers.DictField(), "b": serializers.DictField(), "score": serializers.FloatField()}, many=True))
    @action(detail=False, methods=["get"])
    def duplicates(self, request):
        pairs = services.possible_duplicates()
        ids = {i for p in pairs for i in (p["a"], p["b"])}
        info = {c.pk: c for c in Contact.objects.filter(pk__in=ids).prefetch_related("phones")}
        card = lambda c: {"id": c.pk, "name": c.display_name, "phones": [ph.number for ph in c.phones.all()],
                          "created_at": c.created_at}
        return Response([{"a": card(info[p["a"]]), "b": card(info[p["b"]]), "score": p["score"]} for p in pairs])

    @extend_schema(request=inline_serializer("MergeRequest", {"other_id": serializers.IntegerField()}),
                   responses=ContactSerializer)
    @action(detail=True, methods=["post"])
    def merge(self, request, pk=None):
        other = Contact.objects.get(pk=request.data.get("other_id"))
        primary = services.merge_contacts(self.get_object(), other, by=request.user)
        return Response(ContactSerializer(self.get_queryset().get(pk=primary.pk), context={"request": request}).data)
