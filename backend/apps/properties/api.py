from django.contrib.auth import get_user_model
from drf_spectacular.utils import OpenApiParameter as P
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.catalog.models import Feature, FinishLevel, Location, OwnershipType, PropertyType, Tag
from apps.contacts.models import Contact
from apps.core.serializers import AccessMixin, ArchiveFieldMixin, UserRefSerializer, fk, ref
from apps.core.text import normalize_ar
from apps.core.views import BaseViewSet
from apps.realtime.events import Event, publish

from .models import Property

User = get_user_model()


class ContactRefSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = Contact
        fields = ["id", "name"]


class PropertySerializer(AccessMixin, ArchiveFieldMixin, serializers.ModelSerializer):
    access_resource = "properties"
    owner = ContactRefSerializer(read_only=True)
    owner_id = fk(Contact, "owner", Contact.objects.filter(archived_at__isnull=True), required=True, allow_null=False)
    property_type = ref(PropertyType, ("id", "name", "has_rooms"))(read_only=True, allow_null=True)
    property_type_id = fk(PropertyType, "property_type")
    location = ref(Location)(read_only=True, allow_null=True)
    location_id = fk(Location, "location")
    finish_level = ref(FinishLevel)(read_only=True, allow_null=True)
    finish_level_id = fk(FinishLevel, "finish_level")
    ownership_type = ref(OwnershipType)(read_only=True, allow_null=True)
    ownership_type_id = fk(OwnershipType, "ownership_type")
    features = ref(Feature)(many=True, read_only=True)
    feature_ids = serializers.PrimaryKeyRelatedField(source="features", queryset=Feature.objects.all(), many=True,
                                                     write_only=True, required=False)
    tags = ref(Tag, ("id", "name", "color"))(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(source="tags", queryset=Tag.objects.all(), many=True,
                                                 write_only=True, required=False)
    assignee = UserRefSerializer(read_only=True, allow_null=True)
    assignee_id = fk(User, "assignee", User.objects.filter(is_active=True))

    class Meta:
        model = Property
        fields = ["id", "access", "code", "legacy_code", "owner", "owner_id", "owner_role", "property_type",
                  "property_type_id", "listing", "status", "location", "location_id", "address", "area_m2",
                  "area_note", "rooms", "bathrooms", "floor", "floor_note", "layout_note", "building_state",
                  "finish_level", "finish_level_id", "features", "feature_ids", "ownership_type",
                  "ownership_type_id", "price", "rent_monthly", "currency", "price_note", "commission_pct",
                  "description", "assignee", "assignee_id", "listed_at", "tags", "tag_ids", "is_archived",
                  "created_at", "updated_at"]
        read_only_fields = ["code", "created_at", "updated_at"]

    def validate(self, data):
        if self.instance and "owner" in data and data["owner"] != self.instance.owner:
            raise serializers.ValidationError({"owner_id": ["تغيير المالك بيصير عن طريق صفقة بيع"]})
        return data

    def create(self, data):
        data.pop("is_archived", None)
        data.setdefault("assignee", self.context["request"].user)
        obj = super().create(data)
        publish(Event.CLIENT_CHANGED, id=obj.owner_id)
        return obj

    def update(self, instance, data):
        data = self.apply_archive(instance, data)
        obj = super().update(instance, data)
        publish(Event.CLIENT_CHANGED, id=obj.owner_id)
        return obj


@extend_schema_view(list=extend_schema(parameters=[
    P("owner", int), P("search", str), P("status", str), P("listing", str), P("property_type", int),
    P("location", int), P("assignee", str), P("archived", bool), P("tag", int),
]))
class PropertyViewSet(BaseViewSet):
    serializer_class = PropertySerializer
    resource = "properties"
    action_permissions = {"demands": None}
    ordering_fields = ["created_at", "price", "area_m2", "listed_at"]

    def get_queryset(self):
        qs = (Property.objects.select_related("owner", "property_type", "location", "finish_level", "ownership_type",
                                              "assignee").prefetch_related("features", "tags"))
        if self.action == "list":
            qs = self.mine(self.archived_filter(qs))
            p = self.request.query_params
            for f in ("owner", "property_type", "location"):
                if v := p.get(f):
                    qs = qs.filter(**{f"{f}_id": v})
            for f in ("status", "listing"):
                if v := p.get(f):
                    qs = qs.filter(**{f: v.upper()})
            if v := p.get("tag"):
                qs = qs.filter(tags=v)
            if q := p.get("search"):
                qs = qs.filter(search_text__icontains=normalize_ar(q))
        return qs

    @action(detail=True, methods=["get"])
    def demands(self, request, pk=None):
        """Open buy/rent requests this property fits (matching, other direction)."""
        from apps.deals.services import matching_demands

        return Response([{"deal_id": d.deal_id, "title": d.deal.title, "contact": d.deal.contact.display_name,
                          "kind": d.deal.kind} for d in matching_demands(self.get_object())])
