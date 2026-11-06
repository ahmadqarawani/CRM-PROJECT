"""One activity table for planned AND logged work (Odoo mail.activity / Pipedrive activities):
a call made now has done_at; a site visit next Sunday has due_at; the deal's "next step"
is its nearest open planned activity."""

import builtins

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.properties.models import Property


class Activity(models.Model):
    class Type(models.TextChoices):
        CALL = "CALL", "مكالمة"
        WHATSAPP = "WHATSAPP", "واتساب"
        MEETING = "MEETING", "اجتماع / جلسة اتفاق"
        SITE_VISIT = "SITE_VISIT", "معاينة"
        VIEWING = "VIEWING", "جولة على عقار"
        TASK = "TASK", "مهمة"
        NOTE = "NOTE", "ملاحظة"
        SYSTEM = "SYSTEM", "النظام"

    CONTACT_TYPES = {Type.CALL, Type.WHATSAPP, Type.MEETING, Type.SITE_VISIT, Type.VIEWING}

    type = models.CharField(max_length=10, choices=Type)
    subject = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    outcome = models.TextField(blank=True)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="activities")
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, null=True, blank=True, related_name="activities")
    property = models.ForeignKey(Property, on_delete=models.CASCADE, null=True, blank=True, related_name="activities")
    due_at = models.DateTimeField(null=True, blank=True)    # planned
    done_at = models.DateTimeField(null=True, blank=True)   # happened
    interest = models.PositiveSmallIntegerField(null=True, blank=True)  # viewing feedback 1-5
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["deal", "done_at", "due_at"]),
                   models.Index(fields=["assignee", "done_at", "due_at"])]
        verbose_name_plural = "activities"

    @builtins.property  # a field here is named `property`
    def is_planned(self) -> bool:
        return self.done_at is None and self.due_at is not None

    @builtins.property  # a field here is named `property`
    def when(self):
        return self.done_at or self.due_at or self.created_at
