from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.realtime.events import Event, publish

from .models import Deal, Demand, FinishingSpec, Stage


def default_stage(pipeline: str) -> Stage:
    stage = Stage.objects.filter(pipeline=pipeline, is_active=True, type=Stage.Type.OPEN).order_by("order").first()
    if stage is None:
        raise ValidationError({"stage_id": ["ما في مراحل معرّفة لهالخط"]})
    return stage


def _system_note(deal, by, text):
    from apps.activities.models import Activity

    Activity.objects.create(type=Activity.Type.SYSTEM, contact_id=deal.contact_id, deal=deal, created_by=by,
                            done_at=timezone.now(), subject=text)


@transaction.atomic
def create_deal(*, kind: str, contact, by=None, finishing: dict | None = None, demand: dict | None = None,
                **fields) -> Deal:
    pipeline = Deal.PIPELINE_OF.get(kind, "BROKERAGE")
    stage = fields.pop("stage", None) or default_stage(pipeline)
    if stage.pipeline != pipeline:
        raise ValidationError({"stage_id": ["المرحلة مش من خط هالطلب"]})
    fields.setdefault("source", contact.source)
    fields.setdefault("assignee", contact.assignee or by)
    deal = Deal.objects.create(kind=kind, contact=contact, stage=stage, **fields)
    if kind == Deal.Kind.FINISHING:
        FinishingSpec.objects.create(deal=deal, **_plain(finishing))
    elif kind in (Deal.Kind.BUY, Deal.Kind.RENT):
        set_demand(deal, demand or {})
    publish(Event.REQUEST_CHANGED, id=deal.pk)
    return deal


def _plain(d: dict | None) -> dict:
    return {k: v for k, v in (d or {}).items() if not isinstance(v, (list, tuple, set))}


def set_demand(deal: Deal, data: dict) -> Demand:
    demand, _ = Demand.objects.update_or_create(deal=deal, defaults=_plain(data))
    for m2m in ("property_types", "locations", "finish_levels"):
        if m2m in data:
            getattr(demand, m2m).set(data[m2m])
    return demand


@transaction.atomic
def change_stage(deal: Deal, to: Stage, *, by=None, lost_reason=None, lost_notes: str = "") -> Deal:
    deal = Deal.objects.select_for_update().select_related("stage").get(pk=deal.pk)
    if to.pipeline != deal.pipeline:
        raise ValidationError({"stage_id": ["المرحلة مش من خط هالطلب"]})
    if not to.is_active:
        raise ValidationError({"stage_id": ["هالمرحلة موقّفة"]})
    if to.type == Stage.Type.LOST and not (lost_reason or deal.lost_reason_id):
        raise ValidationError({"lost_reason_id": ["اختار سبب الخسارة"]})
    if deal.stage_id == to.id and not lost_reason:
        return deal
    old = deal.stage.name
    deal.stage, deal.stage_entered_at = to, timezone.now()
    if to.type == Stage.Type.OPEN:
        deal.closed_at, deal.lost_reason, deal.lost_notes = None, None, ""
    else:
        deal.closed_at = deal.closed_at or timezone.now()
        if to.type == Stage.Type.LOST:
            deal.lost_reason = lost_reason or deal.lost_reason
            deal.lost_notes = lost_notes or deal.lost_notes
    deal.save()
    _system_note(deal, by, f"{old} ← {to.name}" + (f" ({deal.lost_reason.name})" if to.type == "LOST" else ""))
    if to.type == Stage.Type.WON and deal.property_id and deal.kind in (Deal.Kind.BUY, Deal.Kind.SELL):
        deal.property.status = "SOLD"
        deal.property.save(update_fields=["status"])
    elif to.type == Stage.Type.WON and deal.property_id and deal.kind in (Deal.Kind.RENT, Deal.Kind.LEASE):
        deal.property.status = "RENTED"
        deal.property.save(update_fields=["status"])
    publish(Event.REQUEST_CHANGED, id=deal.pk)
    return deal


def matching_properties(demand: Demand):
    """EspoCRM matching: same listing kind, any wanted area/type/level, numbers inside ranges."""
    from apps.properties.models import Property

    listing = ["SALE", "BOTH"] if demand.deal.kind == Deal.Kind.BUY else ["RENT", "BOTH"]
    price_field = "price" if demand.deal.kind == Deal.Kind.BUY else "rent_monthly"
    qs = Property.objects.active().filter(status="AVAILABLE", listing__in=listing)
    if ids := list(demand.property_types.values_list("pk", flat=True)):
        qs = qs.filter(property_type__in=ids)
    if ids := list(demand.locations.values_list("pk", flat=True)):
        qs = qs.filter(location__in=ids)
    if ids := list(demand.finish_levels.values_list("pk", flat=True)):
        qs = qs.filter(Q(finish_level__in=ids) | Q(finish_level__isnull=True))
    ranges = [(price_field, demand.budget_min, demand.budget_max), ("area_m2", demand.area_min, demand.area_max),
              ("floor", demand.floor_min, demand.floor_max)]
    for field, lo, hi in ranges:
        if lo is not None:
            qs = qs.filter(Q(**{f"{field}__gte": lo}) | Q(**{f"{field}__isnull": True}))
        if hi is not None:
            qs = qs.filter(Q(**{f"{field}__lte": hi}) | Q(**{f"{field}__isnull": True}))
    if demand.rooms_min:
        qs = qs.filter(Q(rooms__gte=demand.rooms_min) | Q(rooms__isnull=True))
    return qs.exclude(owner_id=demand.deal.contact_id)


def matching_demands(prop):
    """The other direction: open buy/rent demands this property fits."""
    open_demands = Demand.objects.filter(deal__stage__type="OPEN", deal__archived_at__isnull=True).select_related("deal")
    return [d for d in open_demands if matching_properties(d).filter(pk=prop.pk).exists()]


@transaction.atomic
def convert_to_finishing(deal: Deal, *, by=None) -> Deal:
    """A buyer of an unfinished property -> a finishing request for the same client (one button)."""
    new = create_deal(kind=Deal.Kind.FINISHING, contact=deal.contact, by=by, property=deal.property,
                      location=deal.location, title=f"إكساء — {deal.title or deal.property or ''}".strip(" —"),
                      finishing={"area_m2": deal.property.area_m2 if deal.property else None})
    _system_note(deal, by, f"تحوّل لطلب إكساء #{new.pk}")
    return new


@transaction.atomic
def hand_over(*, from_user, to_user, by=None) -> dict:
    """Move all open work of one employee to another in one step."""
    from apps.activities.models import Activity
    from apps.contacts.models import Contact
    from apps.properties.models import Property

    counts = {
        "deals": Deal.objects.filter(assignee=from_user, stage__type="OPEN").update(assignee=to_user),
        "activities": Activity.objects.filter(assignee=from_user, done_at__isnull=True).update(assignee=to_user),
        "contacts": Contact.objects.filter(assignee=from_user, archived_at__isnull=True).update(assignee=to_user),
        "properties": Property.objects.filter(assignee=from_user, archived_at__isnull=True).update(assignee=to_user),
    }
    publish(Event.REQUEST_CHANGED)
    return counts
