"""Editable lookup lists (admin area). Nothing here is hard-coded in business logic."""

from django.db import models


class Lookup(models.Model):
    name = models.CharField(max_length=100, unique=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class Source(Lookup):
    """How the client found us: WhatsApp, Instagram, phone call, friends & referrals…"""

    opens_whatsapp = models.BooleanField(default=False)  # client phones default to "has WhatsApp"


class LostReason(Lookup):
    class AppliesTo(models.TextChoices):
        ALL = "ALL", "الكل"
        FINISHING = "FINISHING", "الإكساء"
        BROKERAGE = "BROKERAGE", "الوساطة"

    applies_to = models.CharField(max_length=10, choices=AppliesTo, default=AppliesTo.ALL)


class Location(Lookup):
    """Area/neighbourhood. Flat for now (governorate level deferred; add `parent` later)."""


class PropertyType(Lookup):
    has_rooms = models.BooleanField(default=True)  # land/shop/factory hide rooms & floor


class FinishLevel(Lookup):
    """One list shared by properties, finishing requests and buyer demands (عضم … سوبر ديلوكس)."""


class ServiceType(Lookup):
    """Finishing service: full finishing, renovation, re-partitioning, partial works."""


class OwnershipType(Lookup):
    pass


class Feature(Lookup):
    """Property extras: balcony, terrace, garden, roof…"""


class Tag(Lookup):
    color = models.CharField(max_length=7, default="#64748b")
