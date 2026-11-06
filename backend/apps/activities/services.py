from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Max, OuterRef, Q, Subquery
from django.utils import timezone

from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.realtime.events import Event, publish

from .models import Activity


def _touch_contact(act: Activity) -> None:
    if act.type not in Activity.CONTACT_TYPES or act.done_at is None:
        return
    newer = Q(last_contact_at__isnull=True) | Q(last_contact_at__lt=act.done_at)
    Contact.objects.filter(newer, pk=act.contact_id).update(last_contact_at=act.done_at)
    if act.deal_id:
        Deal.objects.filter(newer, pk=act.deal_id).update(last_contact_at=act.done_at)


def backfill_last_contact() -> int:
    """Set each contact's last_contact_at from its done contact-type activities (for bulk imports,
    which create activities directly and skip _touch_contact). Returns how many contacts changed."""
    latest = (Activity.objects.filter(contact=OuterRef("pk"), type__in=Activity.CONTACT_TYPES, done_at__isnull=False)
              .values("contact").annotate(m=Max("done_at")).values("m"))
    qs = Contact.objects.annotate(latest=Subquery(latest)).filter(latest__isnull=False)
    stale = qs.filter(Q(last_contact_at__isnull=True) | Q(last_contact_at__lt=F("latest")))
    return stale.update(last_contact_at=Subquery(latest))


def _check_links(contact, deal, prop):
    if deal and deal.contact_id != contact.pk:
        raise ValidationError({"deal_id": ["الطلب مش لهالعميل"]})
    if prop and prop.owner_id != contact.pk and not (deal and deal.property_id == prop.pk):
        raise ValidationError({"property_id": ["العقار مش مربوط بهالعميل"]})


@transaction.atomic
def log_activity(*, contact, type, by, notes="", outcome="", deal=None, property=None, subject="",
                 done_at=None, interest=None, next_due=None, next_type=None, next_subject="") -> Activity:
    """Something happened (call, WhatsApp, visit…). Optionally plan the next step in the same go —
    the quick 'what happened + next follow-up' sheet."""
    _check_links(contact, deal, property)
    done_at = done_at or timezone.now()
    if done_at > timezone.now() + timezone.timedelta(minutes=5):
        raise ValidationError({"done_at": ["ما بينفع تسجّل شي صار بالمستقبل"]})
    act = Activity.objects.create(type=type, contact=contact, deal=deal, property=property, notes=notes,
                                  outcome=outcome, subject=subject, done_at=done_at, interest=interest,
                                  assignee=by, created_by=by)
    _touch_contact(act)
    if next_due:
        plan_activity(contact=contact, deal=deal, property=property, by=by, due_at=next_due,
                      type=next_type or Activity.Type.CALL, subject=next_subject or "متابعة")
    publish(Event.ACTIVITY_CREATED, client_id=contact.pk, request_id=deal.pk if deal else None)
    return act


@transaction.atomic
def plan_activity(*, contact, type, due_at, by, deal=None, property=None, subject="", notes="",
                  assignee=None) -> Activity:
    _check_links(contact, deal, property)
    act = Activity.objects.create(type=type, contact=contact, deal=deal, property=property, due_at=due_at,
                                  subject=subject, notes=notes, assignee=assignee or by, created_by=by)
    publish(Event.TASK_CHANGED, id=act.pk)
    if act.assignee_id and act.assignee_id != getattr(by, "pk", None):
        from apps.notifications.services import notify

        notify(act.assignee, "ASSIGNED", activity=act, deal=deal)
    return act


@transaction.atomic
def complete_activity(act: Activity, *, by, outcome: str = "", interest=None) -> Activity:
    if act.done_at:
        return act
    act.done_at = timezone.now()
    act.outcome = outcome or act.outcome
    if interest is not None:
        act.interest = interest
    act.save()
    _touch_contact(act)
    publish(Event.TASK_CHANGED, id=act.pk)
    return act
