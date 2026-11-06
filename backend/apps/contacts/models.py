from django.conf import settings
from django.db import models

from apps.catalog.models import Source, Tag
from apps.core.models import Archivable, TimeStamped
from apps.core.text import name_key, normalize_ar


class Contact(TimeStamped, Archivable):
    """One record per real person. What they are (finishing client, owner, buyer) comes from
    their deals and properties, not from a type field."""

    name = models.CharField(max_length=200, blank=True)  # optional: many leads only left a number
    source = models.ForeignKey(Source, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    referred_by = models.CharField(max_length=200, blank=True)  # person who referred them (free text)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="+")
    last_contact_at = models.DateTimeField(null=True, blank=True)
    merged_into = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    name_key = models.CharField(max_length=200, editable=False, default="", db_index=True)
    search_text = models.TextField(editable=False, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self) -> str:
        if self.name:
            return self.name
        phone = self.phones.order_by("-is_primary", "id").first()
        return phone.number if phone else f"#{self.pk}"

    def refresh_search(self, save=True):
        numbers = list(self.phones.values_list("number", flat=True)) if self.pk else []
        self.name_key = name_key(self.name)
        self.search_text = normalize_ar(" ".join([self.name, *numbers, *[n.lstrip("+") for n in numbers],
                                                  *[n.replace("+963", "0") for n in numbers]]))
        if save:
            Contact.objects.filter(pk=self.pk).update(name_key=self.name_key, search_text=self.search_text)

    def save(self, *args, **kwargs):
        self.refresh_search(save=False)
        super().save(*args, **kwargs)


class ContactPhone(models.Model):
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="phones")
    number = models.CharField(max_length=20, unique=True)  # E.164 — one number, one person
    has_whatsapp = models.BooleanField(default=True)
    is_primary = models.BooleanField(default=False)
    label = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["-is_primary", "id"]

    def __str__(self):
        return self.number
