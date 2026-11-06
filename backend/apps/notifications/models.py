from django.conf import settings
from django.db import models

from apps.activities.models import Activity
from apps.deals.models import Deal


class Notification(models.Model):
    class Kind(models.TextChoices):
        ACTIVITY_DUE = "ACTIVITY_DUE", "موعد قريب"
        ACTIVITY_OVERDUE = "ACTIVITY_OVERDUE", "متابعة متأخرة"
        NO_NEXT_STEP = "NO_NEXT_STEP", "طلب بلا خطوة جاية"
        DEAL_STUCK = "DEAL_STUCK", "طلب واقف بمرحلته"
        ASSIGNED = "ASSIGNED", "انسندلك"
        DIGEST = "DIGEST", "ملخص اليوم"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=20, choices=Kind)
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    activity = models.ForeignKey(Activity, on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    text = models.CharField(max_length=300, blank=True)  # bundled messages (digest, end-of-day overdue)
    day = models.DateField()
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["user", "kind", "deal", "activity", "day"],
                                               nulls_distinct=False, name="one_notification_per_day")]

    @property
    def is_read(self) -> bool:
        return self.read_at is not None


class NotificationPreference(models.Model):
    """Per user: mute kinds (quiet hours / digest are global settings)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    kind = models.CharField(max_length=20, choices=Notification.Kind)
    muted = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "kind"], name="one_pref_per_kind")]
