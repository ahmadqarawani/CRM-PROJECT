from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter as P
from drf_spectacular.utils import extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.contacts.models import Contact
from apps.core.serializers import UserRefSerializer, fk
from apps.core.views import BaseViewSet, flag
from apps.deals.models import Deal
from apps.properties.api import ContactRefSerializer
from apps.properties.models import Property
from apps.realtime.events import Event, publish

from . import services
from .models import Activity

User = get_user_model()


class DealMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deal
        fields = ["id", "title", "kind"]


class ActivitySerializer(serializers.ModelSerializer):
    contact = ContactRefSerializer(read_only=True)
    contact_id = fk(Contact, "contact", required=True, allow_null=False)
    deal = DealMiniSerializer(read_only=True, allow_null=True)
    deal_id = fk(Deal, "deal")
    property_id = fk(Property, "property")
    assignee = UserRefSerializer(read_only=True, allow_null=True)
    assignee_id = fk(User, "assignee", User.objects.filter(is_active=True))
    created_by = UserRefSerializer(read_only=True, allow_null=True)
    is_done = serializers.BooleanField(required=False, write_only=True)
    # quick "what happened + next follow-up" in one request
    next_due = serializers.DateTimeField(required=False, write_only=True, allow_null=True)
    next_type = serializers.ChoiceField(Activity.Type.choices, required=False, write_only=True)
    next_subject = serializers.CharField(required=False, write_only=True, allow_blank=True)

    class Meta:
        model = Activity
        fields = ["id", "type", "subject", "notes", "outcome", "contact", "contact_id", "deal", "deal_id",
                  "property_id", "due_at", "done_at", "interest", "assignee", "assignee_id", "created_by",
                  "created_at", "is_done", "next_due", "next_type", "next_subject"]
        read_only_fields = ["created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["property_id"] = instance.property_id
        return data

    def create(self, data):
        user = self.context["request"].user
        data.pop("is_done", None)
        nxt = {k: data.pop(k, None) for k in ("next_due", "next_type", "next_subject")}
        if data.get("type") == Activity.Type.SYSTEM:
            raise serializers.ValidationError({"type": ["نوع مش مسموح"]})
        if data.get("due_at") and not data.get("done_at"):
            return services.plan_activity(by=user, **{k: v for k, v in data.items() if k not in ("outcome", "interest")})
        return services.log_activity(by=user, next_due=nxt["next_due"], next_type=nxt["next_type"],
                                     next_subject=nxt["next_subject"] or "",
                                     **{k: v for k, v in data.items() if k not in ("due_at", "assignee")})

    def update(self, instance, data):
        done = data.pop("is_done", None)
        for k in ("next_due", "next_type", "next_subject", "contact"):
            data.pop(k, None)
        instance = super().update(instance, data)
        if done:
            instance = services.complete_activity(instance, by=self.context["request"].user)
        elif done is False and instance.done_at:
            instance.done_at = None
            instance.save(update_fields=["done_at"])
        publish(Event.TASK_CHANGED, id=instance.pk)
        return instance


@extend_schema_view(list=extend_schema(parameters=[
    P("contact", int), P("deal", int), P("property", int), P("assignee", str), P("planned", bool),
    P("due", str, enum=["overdue", "today", "week"]), P("type", str),
]))
class ActivityViewSet(BaseViewSet):
    serializer_class = ActivitySerializer
    resource = "activities"
    action_permissions = {"complete": "activities.edit"}
    ordering_fields = ["due_at", "done_at", "created_at"]

    def get_queryset(self):
        qs = Activity.objects.select_related("contact", "deal", "assignee", "created_by")
        if self.action != "list":
            return qs
        p = self.request.query_params
        for f in ("contact", "deal", "property"):
            if v := p.get(f):
                qs = qs.filter(**{f"{f}_id": v})
        if v := p.get("type"):
            qs = qs.filter(type=v.upper())
        qs = self.mine(qs)
        planned = flag(self.request, "planned")
        if planned is True:
            qs = qs.filter(done_at__isnull=True, due_at__isnull=False).order_by("due_at")
        elif planned is False:
            qs = qs.filter(done_at__isnull=False)
        now = timezone.now()
        start = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
        due = p.get("due")
        if due == "overdue":
            qs = qs.filter(done_at__isnull=True, due_at__lt=now).order_by("due_at")
        elif due in ("today", "week"):
            qs = qs.filter(done_at__isnull=True, due_at__gte=start,
                           due_at__lt=start + timedelta(days=1 if due == "today" else 7)).order_by("due_at")
        return qs

    @extend_schema(request=inline_serializer("CompleteActivity", {
        "outcome": serializers.CharField(required=False), "interest": serializers.IntegerField(required=False),
        "next_due": serializers.DateTimeField(required=False), "next_type": serializers.CharField(required=False)}),
        responses=ActivitySerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Mark a planned activity done, write the outcome, and (optionally) plan the next one."""
        act = services.complete_activity(self.get_object(), by=request.user, outcome=request.data.get("outcome", ""),
                                         interest=request.data.get("interest"))
        if nd := request.data.get("next_due"):
            services.plan_activity(contact=act.contact, deal=act.deal, property=act.property, by=request.user,
                                   due_at=serializers.DateTimeField().to_internal_value(nd),
                                   type=request.data.get("next_type") or "CALL", subject="متابعة")
        return Response(ActivitySerializer(act, context={"request": request}).data)
