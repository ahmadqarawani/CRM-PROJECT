import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.db import models

from apps.contacts.models import Contact
from apps.core.models import Archivable, TimeStamped
from apps.deals.models import Deal, Quote
from apps.properties.models import Property


def document_path(instance: "Document", filename: str) -> str:
    ext = PurePosixPath(filename).suffix.lower()
    return f"documents/{instance.contact_id}/{uuid.uuid4().hex}{ext}"


class Document(TimeStamped, Archivable):
    class Category(models.TextChoices):
        PHOTO = "PHOTO", "صور"
        PLAN = "PLAN", "مخطط"
        QUOTE = "QUOTE", "دراسة / عرض سعر"
        CONTRACT = "CONTRACT", "عقد"
        INVOICE = "INVOICE", "فاتورة / إيصال"
        OWNERSHIP = "OWNERSHIP", "أوراق ملكية"
        OTHER = "OTHER", "أخرى"

    file = models.FileField(upload_to=document_path, max_length=255)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.PositiveIntegerField()
    category = models.CharField(max_length=10, choices=Category, default=Category.OTHER)
    contact = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name="documents")
    deal = models.ForeignKey(Deal, on_delete=models.SET_NULL, null=True, blank=True, related_name="documents")
    property = models.ForeignKey(Property, on_delete=models.SET_NULL, null=True, blank=True, related_name="documents")
    quote = models.ForeignKey(Quote, on_delete=models.SET_NULL, null=True, blank=True, related_name="documents")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-created_at"]
