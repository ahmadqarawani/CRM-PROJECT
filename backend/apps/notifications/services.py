"""Notifications that help and don't annoy (agreed with the team):
  - appointment reminder 1 hour before (ACTIVITY_DUE)
  - morning digest at SiteSettings.digest_hour (DIGEST), also by email when configured
  - overdue follow-ups bundled ONCE at end of day (ACTIVITY_OVERDUE)
  - nothing pushed during quiet hours; it lands in the next digest
  - each user can mute kinds (NotificationPreference)"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.core.models import SiteSettings
from apps.realtime.events import Event, publish

from .models import Notification, NotificationPreference

END_OF_DAY_HOUR = 20


def in_quiet_hours(now=None, s: SiteSettings | None = None) -> bool:
    s = s or SiteSettings.load()
    h = timezone.localtime(now or timezone.now()).hour
    if s.quiet_start_hour > s.quiet_end_hour:
        return h >= s.quiet_start_hour or h < s.quiet_end_hour
    return s.quiet_start_hour <= h < s.quiet_end_hour


def notify(user, kind, *, deal=None, activity=None, text="", now=None) -> Notification | None:
    if user is None or not user.is_active:
        return None
    if NotificationPreference.objects.filter(user=user, kind=kind, muted=True).exists():
        return None
    now = now or timezone.now()
    n, created = Notification.objects.get_or_create(
        user=user, kind=kind, deal=deal, activity=activity, day=timezone.localdate(now), defaults={"text": text})
    if created and not in_quiet_hours(now):
        publish(Event.NOTIFICATION_CREATED, user_id=user.pk)
    return n if created else None


def tick(now=None) -> dict:
    """Run every 5 minutes. Idempotent (unique per user/kind/target/day)."""
    from apps.activities.models import Activity
    from apps.deals.models import Deal
    from apps.deals.overdue import with_attention

    now = now or timezone.now()
    local = timezone.localtime(now)
    s = SiteSettings.load()
    out = {"due": 0, "digest": 0, "overdue": 0}
    with transaction.atomic():
        if not in_quiet_hours(now, s):
            soon = Activity.objects.filter(done_at__isnull=True, due_at__gt=now, due_at__lte=now + timedelta(hours=1),
                                           assignee__isnull=False).select_related("assignee", "deal")
            for a in soon:
                out["due"] += bool(notify(a.assignee, "ACTIVITY_DUE", activity=a, deal=a.deal, now=now))

        users = get_user_model().objects.filter(is_active=True)
        if local.hour >= s.digest_hour:
            today_end = local.replace(hour=23, minute=59)
            for u in users:
                planned = Activity.objects.filter(assignee=u, done_at__isnull=True, due_at__isnull=False)
                today = planned.filter(due_at__lte=today_end, due_at__gte=now).count()
                late = planned.filter(due_at__lt=now).count()
                no_step = with_attention(Deal.objects.filter(assignee=u)).filter(r_no_next_step=True).count()
                if today or late or no_step:
                    text = f"اليوم: {today} مواعيد · متأخر: {late} · طلبات بلا خطوة جاية: {no_step}"
                    if notify(u, "DIGEST", text=text, now=now):
                        out["digest"] += 1
                        send_digest_email(u, text)

        if local.hour >= END_OF_DAY_HOUR:
            for u in users:
                late = Activity.objects.filter(assignee=u, done_at__isnull=True, due_at__lt=now).count()
                if late:
                    out["overdue"] += bool(notify(u, "ACTIVITY_OVERDUE", now=now,
                                                  text=f"عندك {late} متابعات تأخرت، بتنضاف لملخص بكرا"))
    return out


def send_digest_email(user, text: str) -> None:
    from apps.core.mail import send_mail_dynamic

    if user.email:
        send_mail_dynamic(subject="ملخص اليوم — BGI CRM", body=text, to=[user.email], fail_silently=True)
