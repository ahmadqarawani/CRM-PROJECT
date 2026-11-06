"""The ONLY definition of "needs attention" (Pipedrive/Odoo rules):
  ACTIVITY_OVERDUE  an open planned activity is past due
  NO_NEXT_STEP      an open deal has no planned activity at all
  STUCK             the deal sat in its stage longer than the stage's rotting_days"""

from django.db.models import (BooleanField, DateTimeField, DurationField, Exists, ExpressionWrapper, F, Func, Min,
                              OuterRef, Q, Subquery, Value)
from django.db.models.functions import Coalesce
from django.utils import timezone

REASONS = {"r_activity_overdue": "ACTIVITY_OVERDUE", "r_no_next_step": "NO_NEXT_STEP", "r_stuck": "STUCK"}


def _flag(cond):
    return Coalesce(ExpressionWrapper(cond, output_field=BooleanField()), Value(False))


def with_attention(queryset, now=None):
    from apps.activities.models import Activity

    now = now or timezone.now()
    planned = Activity.objects.filter(deal=OuterRef("pk"), done_at__isnull=True, due_at__isnull=False)
    is_open = Q(stage__type="OPEN", archived_at__isnull=True, contact__archived_at__isnull=True)
    rot = Func(F("stage__rotting_days"), template="make_interval(days => %(expressions)s)", output_field=DurationField())
    qs = queryset.annotate(
        next_step_at=Subquery(planned.values("deal").annotate(m=Min("due_at")).values("m")[:1],
                              output_field=DateTimeField()),
        _has_planned=Exists(planned),
        _has_overdue=Exists(planned.filter(due_at__lt=now)),
        stuck_since=ExpressionWrapper(F("stage_entered_at") + rot, output_field=DateTimeField()),
    )
    return qs.annotate(
        r_activity_overdue=_flag(is_open & Q(_has_overdue=True)),
        r_no_next_step=_flag(is_open & Q(_has_planned=False)),
        r_stuck=_flag(is_open & Q(stuck_since__lt=now)),
    ).annotate(
        needs_attention=_flag(Q(r_activity_overdue=True) | Q(r_no_next_step=True) | Q(r_stuck=True)),
    )


def reasons_of(obj) -> list[str]:
    return [code for attr, code in REASONS.items() if getattr(obj, attr, False)]
