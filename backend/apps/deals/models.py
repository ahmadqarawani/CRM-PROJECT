"""Deals on pipelines (Odoo crm.lead / Frappe CRM Deal pattern): one table for every request,
whatever the section; the section is the pipeline. Type-specific details live in 1:1 tables."""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalog.models import FinishLevel, Location, LostReason, PropertyType, ServiceType, Source, Tag
from apps.contacts.models import Contact
from apps.core.models import Archivable, TimeStamped
from apps.properties.models import Property


class Pipeline(models.TextChoices):
    FINISHING = "FINISHING", "الإكساء"
    BROKERAGE = "BROKERAGE", "الوساطة العقارية"


class Stage(models.Model):
    class Type(models.TextChoices):
        OPEN = "OPEN", "مفتوحة"
        WON = "WON", "رابحة"
        LOST = "LOST", "خاسرة"

    pipeline = models.CharField(max_length=10, choices=Pipeline)
    name = models.CharField(max_length=80)
    order = models.PositiveSmallIntegerField()
    color = models.CharField(max_length=7, default="#64748b")
    type = models.CharField(max_length=4, choices=Type, default=Type.OPEN)
    rotting_days = models.PositiveSmallIntegerField(null=True, blank=True)  # "stuck" after N days
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["pipeline", "order", "id"]

    def __str__(self):
        return f"{self.get_pipeline_display()} / {self.name}"


class Deal(TimeStamped, Archivable):
    class Kind(models.TextChoices):
        FINISHING = "FINISHING", "إكساء"
        BUY = "BUY", "شراء"
        RENT = "RENT", "استئجار"
        SELL = "SELL", "بيع عقار"
        LEASE = "LEASE", "تأجير عقار"

    PIPELINE_OF = {Kind.FINISHING: Pipeline.FINISHING}  # everything else: brokerage

    class Temperature(models.TextChoices):
        HOT = "HOT", "ساخن"
        WARM = "WARM", "دافئ"
        COLD = "COLD", "بارد"

    kind = models.CharField(max_length=10, choices=Kind)
    pipeline = models.CharField(max_length=10, choices=Pipeline, editable=False)
    contact = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name="deals")
    title = models.CharField(max_length=200, blank=True)
    stage = models.ForeignKey(Stage, on_delete=models.PROTECT, related_name="deals")
    stage_entered_at = models.DateTimeField(default=timezone.now)
    temperature = models.CharField(max_length=4, choices=Temperature, blank=True)
    source = models.ForeignKey(Source, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    engineer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    property = models.ForeignKey(Property, on_delete=models.PROTECT, null=True, blank=True, related_name="deals")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    address = models.CharField(max_length=300, blank=True)
    expected_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    contract_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    lost_reason = models.ForeignKey(LostReason, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    lost_notes = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_close = models.DateField(null=True, blank=True)
    execution_started_at = models.DateField(null=True, blank=True)
    handover_expected = models.DateField(null=True, blank=True)
    last_contact_at = models.DateTimeField(null=True, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["pipeline", "stage"])]

    def __str__(self):
        return self.title or f"#{self.pk}"

    def save(self, *args, **kwargs):
        self.pipeline = self.PIPELINE_OF.get(self.kind, Pipeline.BROKERAGE)
        super().save(*args, **kwargs)

    @property
    def status(self) -> str:
        return self.stage.type


class FinishingSpec(models.Model):
    deal = models.OneToOneField(Deal, on_delete=models.CASCADE, related_name="finishing")
    service_type = models.ForeignKey(ServiceType, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    target_level = models.ForeignKey(FinishLevel, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    current_level = models.ForeignKey(FinishLevel, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    property_type = models.ForeignKey(PropertyType, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    area_m2 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    budget_min = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    budget_max = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    property_note = models.CharField(max_length=300, blank=True)  # original free text ("شقة 125م كسوة قديمة")


class Demand(models.Model):
    """What a buyer/tenant wants (EspoCRM RealEstateRequest): ranges + several areas."""

    deal = models.OneToOneField(Deal, on_delete=models.CASCADE, related_name="demand")
    property_types = models.ManyToManyField(PropertyType, blank=True, related_name="+")
    locations = models.ManyToManyField(Location, blank=True, related_name="+")
    budget_min = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    budget_max = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    area_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    area_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    rooms_min = models.PositiveSmallIntegerField(null=True, blank=True)
    floor_min = models.SmallIntegerField(null=True, blank=True)
    floor_max = models.SmallIntegerField(null=True, blank=True)
    finish_levels = models.ManyToManyField(FinishLevel, blank=True, related_name="+")
    notes = models.TextField(blank=True)


class DemandMatch(models.Model):
    """A property we proposed for a demand, and how the client reacted (EspoCRM interestDegree)."""

    class Status(models.TextChoices):
        SUGGESTED = "SUGGESTED", "مقترح"
        SENT = "SENT", "أُرسل"
        VIEWED = "VIEWED", "عاينه"
        INTERESTED = "INTERESTED", "مهتم"
        REJECTED = "REJECTED", "رفض"

    demand = models.ForeignKey(Demand, on_delete=models.CASCADE, related_name="matches")
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="matches")
    status = models.CharField(max_length=10, choices=Status, default=Status.SUGGESTED)
    note = models.CharField(max_length=300, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["demand", "property"], name="one_match_per_pair")]


class Quote(TimeStamped):
    """Cost study / quotation (Odoo sale.order states)."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "مسودة"
        SENT = "SENT", "مُرسلة"
        ACCEPTED = "ACCEPTED", "مقبولة"
        REJECTED = "REJECTED", "مرفوضة"
        EXPIRED = "EXPIRED", "منتهية"
        CANCELLED = "CANCELLED", "ملغاة"

    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="quotes")
    version = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=10, choices=Status, default=Status.DRAFT)
    amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    sent_at = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-version"]


class Payment(models.Model):
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    paid_at = models.DateField()
    note = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-paid_at"]
