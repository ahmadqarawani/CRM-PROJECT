from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter as P
from drf_spectacular.utils import extend_schema, extend_schema_view, inline_serializer
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.access.services import has, scoped
from apps.catalog.models import FinishLevel, Location, LostReason, PropertyType, ServiceType, Source, Tag
from apps.contacts.models import Contact
from apps.core.serializers import AccessMixin, ArchiveFieldMixin, UserRefSerializer, fk, ref
from apps.core.views import BaseViewSet, Perm, flag
from apps.properties.api import ContactRefSerializer
from apps.properties.models import Property
from apps.realtime.events import Event, publish

from . import services
from .models import Deal, Demand, DemandMatch, FinishingSpec, Payment, Quote, Stage
from .overdue import reasons_of, with_attention

User = get_user_model()


class StageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = ["id", "pipeline", "name", "order", "color", "type", "rotting_days", "is_active"]


@extend_schema_view(list=extend_schema(parameters=[P("pipeline", str), P("include_inactive", bool)]))
class StageViewSet(viewsets.ModelViewSet):
    serializer_class = StageSerializer
    permission_classes = [permissions.IsAuthenticated, Perm("admin.settings", read_open=True)]
    pagination_class = None

    def get_queryset(self):
        qs = Stage.objects.all()
        if v := self.request.query_params.get("pipeline"):
            qs = qs.filter(pipeline=v.upper())
        if self.action == "list" and not flag(self.request, "include_inactive"):
            qs = qs.filter(is_active=True)
        return qs


class FinishingSerializer(serializers.ModelSerializer):
    service_type = ref(ServiceType)(read_only=True, allow_null=True)
    service_type_id = fk(ServiceType, "service_type")
    target_level = ref(FinishLevel)(read_only=True, allow_null=True)
    target_level_id = fk(FinishLevel, "target_level")
    current_level = ref(FinishLevel)(read_only=True, allow_null=True)
    current_level_id = fk(FinishLevel, "current_level")
    property_type = ref(PropertyType, ("id", "name", "has_rooms"))(read_only=True, allow_null=True)
    property_type_id = fk(PropertyType, "property_type")

    class Meta:
        model = FinishingSpec
        fields = ["service_type", "service_type_id", "target_level", "target_level_id", "current_level",
                  "current_level_id", "property_type", "property_type_id", "area_m2", "budget_min", "budget_max",
                  "property_note"]


class DemandSerializer(serializers.ModelSerializer):
    property_types = ref(PropertyType, ("id", "name", "has_rooms"))(many=True, read_only=True)
    property_type_ids = serializers.PrimaryKeyRelatedField(source="property_types", many=True, required=False,
                                                           queryset=PropertyType.objects.all(), write_only=True)
    locations = ref(Location)(many=True, read_only=True)
    location_ids = serializers.PrimaryKeyRelatedField(source="locations", many=True, required=False,
                                                      queryset=Location.objects.all(), write_only=True)
    finish_levels = ref(FinishLevel)(many=True, read_only=True)
    finish_level_ids = serializers.PrimaryKeyRelatedField(source="finish_levels", many=True, required=False,
                                                          queryset=FinishLevel.objects.all(), write_only=True)

    class Meta:
        model = Demand
        fields = ["property_types", "property_type_ids", "locations", "location_ids", "budget_min", "budget_max",
                  "area_min", "area_max", "rooms_min", "floor_min", "floor_max", "finish_levels",
                  "finish_level_ids", "notes"]


class PropertyRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Property
        fields = ["id", "code", "address"]


class DealSerializer(AccessMixin, ArchiveFieldMixin, serializers.ModelSerializer):
    access_resource = "deals"
    contact = ContactRefSerializer(read_only=True)
    contact_id = fk(Contact, "contact", Contact.objects.filter(archived_at__isnull=True), required=True,
                    allow_null=False)
    stage = ref(Stage, ("id", "name", "color", "type"))(read_only=True)
    stage_id = fk(Stage, "stage", Stage.objects.all(), allow_null=False)
    source = ref(Source)(read_only=True, allow_null=True)
    source_id = fk(Source, "source")
    assignee = UserRefSerializer(read_only=True, allow_null=True)
    assignee_id = fk(User, "assignee", User.objects.filter(is_active=True))
    engineer = UserRefSerializer(read_only=True, allow_null=True)
    engineer_id = fk(User, "engineer", User.objects.filter(is_active=True))
    property = PropertyRefSerializer(read_only=True, allow_null=True)
    property_id = fk(Property, "property")
    location = ref(Location)(read_only=True, allow_null=True)
    location_id = fk(Location, "location")
    lost_reason = ref(LostReason)(read_only=True, allow_null=True)
    lost_reason_id = fk(LostReason, "lost_reason")
    tags = ref(Tag, ("id", "name", "color"))(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(source="tags", queryset=Tag.objects.all(), many=True,
                                                 write_only=True, required=False)
    finishing = FinishingSerializer(required=False, allow_null=True)
    demand = DemandSerializer(required=False, allow_null=True)
    status = serializers.CharField(source="stage.type", read_only=True)
    next_step_at = serializers.DateTimeField(read_only=True, allow_null=True)
    needs_attention = serializers.BooleanField(read_only=True)
    attention_reasons = serializers.SerializerMethodField()
    days_in_stage = serializers.SerializerMethodField()
    paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, allow_null=True)

    class Meta:
        model = Deal
        fields = ["id", "access", "kind", "pipeline", "title", "contact", "contact_id", "stage", "stage_id", "status",
                  "stage_entered_at", "days_in_stage", "temperature", "source", "source_id", "assignee",
                  "assignee_id", "engineer", "engineer_id", "property", "property_id", "location", "location_id",
                  "address", "expected_amount", "contract_amount", "commission_amount", "paid_amount", "currency",
                  "lost_reason", "lost_reason_id", "lost_notes", "closed_at", "expected_close",
                  "execution_started_at", "handover_expected", "last_contact_at", "next_step_at", "needs_attention",
                  "attention_reasons", "finishing", "demand", "tags", "tag_ids", "is_archived", "created_at",
                  "updated_at"]
        read_only_fields = ["pipeline", "stage_entered_at", "closed_at", "last_contact_at", "created_at",
                            "updated_at"]

    def get_attention_reasons(self, obj) -> list[str]:
        return reasons_of(obj)

    def get_days_in_stage(self, obj) -> int:
        return (timezone.now() - obj.stage_entered_at).days

    # field-level security: money is hidden without finance.view; contract/commission change only with finance.manage
    MONEY = ("expected_amount", "contract_amount", "commission_amount", "paid_amount")
    CONTRACT = ("contract_amount", "commission_amount")

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if not has(self.context["request"].user, "finance.view"):
            data.update(dict.fromkeys(self.MONEY))
        return data

    def validate(self, data):
        user = self.context["request"].user
        if not has(user, "finance.view"):
            data.pop("expected_amount", None)  # they never saw it: keep whatever is stored
        if not has(user, "finance.manage"):
            for f in self.CONTRACT:
                if f in data and data[f] != (getattr(self.instance, f) if self.instance else None):
                    raise serializers.ValidationError({f: ["ما عندك صلاحية تغيّر المبالغ"]})
                data.pop(f, None)
        if self.instance:
            if "kind" in data and data["kind"] != self.instance.kind:
                raise serializers.ValidationError({"kind": ["نوع الطلب ما بيتغيّر؛ افتح طلب جديد"]})
            if "contact" in data and data["contact"] != self.instance.contact:
                raise serializers.ValidationError({"contact_id": ["ما بينفع تغيّر عميل الطلب"]})
        return data

    def create(self, data):
        data.pop("is_archived", None)
        tags = data.pop("tags", [])
        deal = services.create_deal(by=self.context["request"].user, finishing=data.pop("finishing", None),
                                    demand=data.pop("demand", None), **data)
        deal.tags.set(tags)
        return deal

    @transaction.atomic
    def update(self, instance, data):
        data = self.apply_archive(instance, data)
        user = self.context["request"].user
        finishing, demand = data.pop("finishing", None), data.pop("demand", None)
        stage, lost_reason = data.pop("stage", None), data.pop("lost_reason", None)
        lost_notes = data.pop("lost_notes", "")
        if stage is not None and (stage != instance.stage or lost_reason):
            instance = services.change_stage(instance, stage, by=user, lost_reason=lost_reason, lost_notes=lost_notes)
        elif lost_reason is not None or lost_notes:
            instance.lost_reason = lost_reason or instance.lost_reason
            instance.lost_notes = lost_notes or instance.lost_notes
        instance = super().update(instance, data)
        if finishing is not None and instance.kind == Deal.Kind.FINISHING:
            FinishingSpec.objects.update_or_create(deal=instance, defaults=finishing)
        if demand is not None and instance.kind in (Deal.Kind.BUY, Deal.Kind.RENT):
            services.set_demand(instance, demand)
        publish(Event.REQUEST_CHANGED, id=instance.pk)
        return instance


@extend_schema_view(list=extend_schema(parameters=[
    P("pipeline", str), P("kind", str), P("stage", int), P("status", str), P("contact", int), P("property", int),
    P("assignee", str), P("engineer", str), P("attention", bool), P("archived", bool), P("tag", int), P("search", str),
]))
class DealViewSet(BaseViewSet):
    serializer_class = DealSerializer
    resource = "deals"
    action_permissions = {"matches": None, "stage_counts": None, "set_match": "deals.edit",
                          "convert": "deals.create"}
    ordering_fields = ["created_at", "next_step_at", "needs_attention", "temperature", "stage_entered_at"]

    def get_queryset(self):
        qs = with_attention(
            Deal.objects.select_related("contact", "stage", "source", "assignee", "engineer", "property", "location",
                                        "lost_reason", "finishing__service_type", "finishing__target_level",
                                        "finishing__current_level", "finishing__property_type", "demand")
            .prefetch_related("tags", "demand__property_types", "demand__locations", "demand__finish_levels")
            .annotate(paid_amount=Sum("payments__amount")))
        if self.action == "list":
            qs = self._list_filters(qs)
        return qs

    def _list_filters(self, qs, *, by_stage=True):
        """The list's query-string filters; stage-counts reuses them all except the stage itself."""
        qs = self.mine(self.archived_filter(qs))
        p = self.request.query_params
        for f in ("pipeline", "kind"):
            if v := p.get(f):
                qs = qs.filter(**{f: v.upper()})
        if v := p.get("status", "").upper():
            # OPEN / WON / LOST, or CLOSED = won + lost
            qs = qs.exclude(stage__type="OPEN") if v == "CLOSED" else qs.filter(stage__type=v)
        for f in ("stage", "contact", "property") if by_stage else ("contact", "property"):
            if v := p.get(f):
                qs = qs.filter(**{f"{f}_id": v})
        if v := p.get("engineer"):
            qs = qs.filter(engineer_id=self.request.user.pk if v == "me" else v)
        if v := p.get("tag"):
            qs = qs.filter(tags=v)
        if q := p.get("search"):
            from apps.contacts.services import search_q

            ids = Contact.objects.filter(search_q(q)).values("pk")
            qs = qs.filter(Q(contact__in=ids) | Q(title__icontains=q))
        a = flag(self.request, "attention")
        if a is not None:
            qs = qs.filter(needs_attention=a)
        return qs

    @extend_schema(parameters=[P("pipeline", str), P("kind", str), P("status", str), P("assignee", str),
                               P("attention", bool), P("archived", bool), P("search", str)],
                   responses=inline_serializer("StageCount", {"stage": serializers.IntegerField(),
                                                              "count": serializers.IntegerField()}, many=True))
    @action(detail=False, methods=["get"], url_path="stage-counts")
    def stage_counts(self, request):
        """How many requests are in each stage under the current filters (the numbers on the stage filter)."""
        qs = scoped(self._list_filters(with_attention(Deal.objects.all()), by_stage=False), request.user, "deals")
        rows = qs.order_by().values("stage_id").annotate(n=Count("id", distinct=True))
        return Response([{"stage": r["stage_id"], "count": r["n"]} for r in rows])

    def _fresh(self, pk):
        return self.get_queryset().get(pk=pk)

    def perform_create(self, serializer):
        serializer.save()
        serializer.instance = self._fresh(serializer.instance.pk)

    def perform_update(self, serializer):
        serializer.save()
        serializer.instance = self._fresh(serializer.instance.pk)

    @extend_schema(responses=inline_serializer("PropertyMatch", {
        "property": serializers.DictField(), "status": serializers.CharField(allow_null=True)}, many=True))
    @action(detail=True, methods=["get"])
    def matches(self, request, pk=None):
        """Available properties fitting this buy/rent demand + what the client said about each."""
        deal = self.get_object()
        if not hasattr(deal, "demand"):
            return Response([])
        status = dict(DemandMatch.objects.filter(demand=deal.demand).values_list("property_id", "status"))
        props = services.matching_properties(deal.demand).select_related("property_type", "location")[:50]
        return Response([{
            "property": {"id": p.id, "code": p.code, "type": p.property_type.name if p.property_type else None,
                         "location": p.location.name if p.location else None, "area_m2": p.area_m2,
                         "rooms": p.rooms, "price": p.price, "rent_monthly": p.rent_monthly},
            "status": status.get(p.id)} for p in props])

    @extend_schema(request=inline_serializer("MatchUpdate", {
        "property_id": serializers.IntegerField(), "status": serializers.ChoiceField(DemandMatch.Status.choices),
        "note": serializers.CharField(required=False)}), responses={204: None})
    @action(detail=True, methods=["post"], url_path="match")
    def set_match(self, request, pk=None):
        deal = self.get_object()
        DemandMatch.objects.update_or_create(demand=deal.demand, property_id=request.data["property_id"],
                                             defaults={"status": request.data["status"],
                                                       "note": request.data.get("note", "")})
        publish(Event.REQUEST_CHANGED, id=deal.pk)
        return Response(status=204)

    @extend_schema(request=None, responses=DealSerializer)
    @action(detail=True, methods=["post"], url_path="convert-to-finishing")
    def convert(self, request, pk=None):
        new = services.convert_to_finishing(self.get_object(), by=request.user)
        return Response(DealSerializer(self._fresh(new.pk), context={"request": request}).data, status=201)


class QuoteSerializer(serializers.ModelSerializer):
    deal_id = fk(Deal, "deal", required=True, allow_null=False)
    created_by = UserRefSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Quote
        fields = ["id", "deal_id", "version", "status", "amount", "currency", "sent_at", "valid_until", "notes",
                  "created_by", "created_at"]
        read_only_fields = ["version", "created_at"]

    def create(self, data):
        deal = data["deal"]
        data["version"] = (deal.quotes.order_by("-version").values_list("version", flat=True).first() or 0) + 1
        data["created_by"] = self.context["request"].user
        if data.get("status") == Quote.Status.SENT and not data.get("sent_at"):
            data["sent_at"] = timezone.now()
        return super().create(data)

    def update(self, instance, data):
        if data.get("status") == Quote.Status.SENT and not instance.sent_at:
            data.setdefault("sent_at", timezone.now())
        return super().update(instance, data)


class PaymentSerializer(serializers.ModelSerializer):
    deal_id = fk(Deal, "deal", required=True, allow_null=False)

    class Meta:
        model = Payment
        fields = ["id", "deal_id", "amount", "currency", "paid_at", "note"]

    def create(self, data):
        data["created_by"] = self.context["request"].user
        return super().create(data)


FINANCE_ACTIONS = {"list": "finance.view", "retrieve": "finance.view", "create": "finance.manage",
                   "update": "finance.manage", "partial_update": "finance.manage", "destroy": "finance.manage"}


@extend_schema_view(list=extend_schema(parameters=[P("deal", int)]))
class QuoteViewSet(BaseViewSet):
    serializer_class = QuoteSerializer
    pagination_class = None
    resource = "quotes"  # visible when the request is; amounts need finance.view
    action_permissions = FINANCE_ACTIONS

    def get_queryset(self):
        qs = Quote.objects.select_related("created_by")
        return qs.filter(deal_id=v) if (v := self.request.query_params.get("deal")) else qs


@extend_schema_view(list=extend_schema(parameters=[P("deal", int)]))
class PaymentViewSet(BaseViewSet):
    serializer_class = PaymentSerializer
    pagination_class = None
    resource = "payments"
    action_permissions = FINANCE_ACTIONS

    def get_queryset(self):
        qs = Payment.objects.all()
        return qs.filter(deal_id=v) if (v := self.request.query_params.get("deal")) else qs


class HandOverSerializer(serializers.Serializer):
    from_user_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    to_user_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))


class HandOverView(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, Perm("admin.handover")]

    @extend_schema(request=HandOverSerializer, responses=inline_serializer("HandOverResult", {
        k: serializers.IntegerField() for k in ("deals", "activities", "contacts", "properties")}))
    def create(self, request):
        s = HandOverSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(services.hand_over(from_user=s.validated_data["from_user_id"],
                                           to_user=s.validated_data["to_user_id"], by=request.user))

