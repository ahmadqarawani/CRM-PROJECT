from django.conf import settings
from django.db import models

from apps.catalog.models import Feature, FinishLevel, Location, OwnershipType, PropertyType, Tag
from apps.contacts.models import Contact
from apps.core.models import Archivable, TimeStamped
from apps.core.text import normalize_ar


class Property(TimeStamped, Archivable):
    """A listing offered by an owner (EspoCRM RealEstateProperty / Odoo estate.property pattern).
    Closing data (final price, buyer, commission) lives on the won Deal, not here."""

    class Listing(models.TextChoices):
        SALE = "SALE", "بيع"
        RENT = "RENT", "إيجار"
        BOTH = "BOTH", "بيع أو إيجار"

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "متاح"
        RESERVED = "RESERVED", "محجوز"
        SOLD = "SOLD", "مباع"
        RENTED = "RENTED", "مؤجر"
        WITHDRAWN = "WITHDRAWN", "مسحوب"

    class BuildingState(models.TextChoices):
        UNDER_CONSTRUCTION = "UNDER_CONSTRUCTION", "قيد الإنشاء"
        NEW = "NEW", "جديد"
        USED = "USED", "مستخدم"

    class OwnerRole(models.TextChoices):
        OWNER = "OWNER", "مالك"
        AGENT = "AGENT", "وكيل"
        BROKER = "BROKER", "وسيط"
        RELATIVE = "RELATIVE", "قريب المالك"

    code = models.CharField(max_length=20, unique=True, blank=True)  # auto: P-0001
    legacy_code = models.CharField(max_length=30, blank=True)
    owner = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name="properties")
    owner_role = models.CharField(max_length=10, choices=OwnerRole, default=OwnerRole.OWNER)
    property_type = models.ForeignKey(PropertyType, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    listing = models.CharField(max_length=4, choices=Listing, default=Listing.SALE)
    status = models.CharField(max_length=10, choices=Status, default=Status.AVAILABLE)
    location = models.ForeignKey(Location, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    address = models.CharField(max_length=300, blank=True)
    area_m2 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    area_note = models.CharField(max_length=200, blank=True)
    rooms = models.PositiveSmallIntegerField(null=True, blank=True)
    bathrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    floor = models.SmallIntegerField(null=True, blank=True)  # -1 basement, 0 ground
    floor_note = models.CharField(max_length=100, blank=True)
    layout_note = models.CharField(max_length=200, blank=True)  # "3 غرف وصالون وحمامين"
    building_state = models.CharField(max_length=20, choices=BuildingState, blank=True)
    finish_level = models.ForeignKey(FinishLevel, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    features = models.ManyToManyField(Feature, blank=True, related_name="+")
    ownership_type = models.ForeignKey(OwnershipType, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    rent_monthly = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    price_note = models.CharField(max_length=200, blank=True)  # original text, SYP, per m², ranges…
    commission_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    description = models.TextField(blank=True)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    listed_at = models.DateField(null=True, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="+")
    search_text = models.TextField(editable=False, default="")

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "properties"

    def __str__(self):
        return self.code or f"#{self.pk}"

    def build_search_text(self) -> str:
        return normalize_ar(" ".join(filter(None, [self.code, self.legacy_code, self.address,
                                                   self.location.name if self.location_id else ""])))

    def save(self, *args, **kwargs):
        self.search_text = self.build_search_text()
        super().save(*args, **kwargs)
        if not self.code:
            # the code needs the pk, so it exists only after the first save: index it too, or P-0012 finds nothing
            self.code = f"P-{self.pk:04d}"
            self.search_text = self.build_search_text()
            Property.objects.filter(pk=self.pk).update(code=self.code, search_text=self.search_text)
