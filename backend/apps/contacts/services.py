"""Contacts: one card per real person. Normalize -> detect -> merge (Odoo/HubSpot pattern)."""

from difflib import SequenceMatcher

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.text import normalize_phone
from apps.realtime.events import Event, publish

from .models import Contact, ContactPhone


def clean_phones(raw_numbers: list[str]) -> list[str]:
    out, bad = [], []
    for raw in raw_numbers:
        if not (raw or "").strip():
            continue
        n = normalize_phone(raw)
        (out if n else bad).append(n or raw)
    if bad:
        raise ValidationError({"phones": [f"رقم مش صالح: {b}" for b in bad]})
    return list(dict.fromkeys(out))


def owner_of(number: str) -> Contact | None:
    p = ContactPhone.objects.select_related("contact").filter(number=number).first()
    return p.contact if p else None


def check_phones_free(numbers: list[str], exclude: Contact | None = None) -> None:
    for n in numbers:
        other = owner_of(n)
        if other and (exclude is None or other.pk != exclude.pk):
            raise ValidationError({"phones": [f"الرقم {n} مسجّل للعميل «{other.display_name}» (#{other.pk})"]},
                                  code="duplicate_phone", params={"contact_id": other.pk})


@transaction.atomic
def create_contact(*, phones: list[str], by=None, **fields) -> Contact:
    numbers = clean_phones(phones)
    check_phones_free(numbers)
    if fields.get("assignee") is None:
        fields["assignee"] = by  # every client has an owner: by default whoever adds it
    contact = Contact.objects.create(**fields)
    # WhatsApp button shows for numbers known to use WhatsApp: default from the source, editable per number
    whatsapp_default = bool(contact.source and contact.source.opens_whatsapp)
    for i, n in enumerate(numbers):
        ContactPhone.objects.create(contact=contact, number=n, is_primary=(i == 0), has_whatsapp=whatsapp_default)
    contact.refresh_search()
    publish(Event.CLIENT_CHANGED, id=contact.pk)
    return contact


@transaction.atomic
def set_phones(contact: Contact, phones: list[dict]) -> None:
    """phones: [{number, has_whatsapp, label}] — replaces the list."""
    numbers = clean_phones([p.get("number", "") for p in phones])
    check_phones_free(numbers, exclude=contact)
    meta = {normalize_phone(p["number"]): p for p in phones if normalize_phone(p.get("number"))}
    contact.phones.exclude(number__in=numbers).delete()
    for i, n in enumerate(numbers):
        ContactPhone.objects.update_or_create(number=n, defaults={
            "contact": contact, "is_primary": i == 0,
            "has_whatsapp": meta.get(n, {}).get("has_whatsapp", False), "label": meta.get(n, {}).get("label", ""),
        })
    contact.refresh_search()
    publish(Event.CLIENT_CHANGED, id=contact.pk)


def possible_duplicates(limit: int = 100, threshold: float = 0.85) -> list[dict]:
    """Pairs of active contacts that look like the same person (same or very similar name key).
    Exact phone duplicates cannot exist (unique), so this is about names only."""
    from apps.core.text import name_words

    # a single first name ("عمر") is far too common to mean "same person": need first + family name
    rows = [(pk, key) for pk, key, name in
            Contact.objects.active().exclude(name_key="").values_list("pk", "name_key", "name")
            if len(name_words(name)) >= 2]
    pairs = []
    for i, (a, ka) in enumerate(rows):
        for b, kb in rows[i + 1:]:
            if ka == kb:
                score = 1.0
            elif abs(len(ka) - len(kb)) > 3 or ka[:2] != kb[:2]:
                continue
            else:
                score = SequenceMatcher(None, ka, kb).ratio()
            if score >= threshold:
                pairs.append({"a": a, "b": b, "score": round(score, 2)})
    pairs.sort(key=lambda p: -p["score"])
    return pairs[:limit]


@transaction.atomic
def merge_contacts(primary: Contact, other: Contact, *, by) -> Contact:
    """Move everything from `other` onto `primary`; `other` is archived with merged_into."""
    if primary.pk == other.pk:
        raise ValidationError({"non_field_errors": ["ما بينفع تدمج العميل مع حاله"]})
    from apps.activities.models import Activity
    from apps.deals.models import Deal
    from apps.documents.models import Document
    from apps.properties.models import Property

    primary = Contact.objects.select_for_update().get(pk=primary.pk)
    other = Contact.objects.select_for_update().get(pk=other.pk)
    ContactPhone.objects.filter(contact=other).update(contact=primary, is_primary=False)
    for model, field in ((Deal, "contact"), (Property, "owner"), (Activity, "contact"), (Document, "contact")):
        model.objects.filter(**{field: other}).update(**{field: primary})
    for f in ("name", "email", "referred_by", "notes"):
        if not getattr(primary, f) and getattr(other, f):
            setattr(primary, f, getattr(other, f))
    if other.notes and other.notes not in primary.notes:
        primary.notes = f"{primary.notes}\n{other.notes}".strip()
    for f in ("source_id", "assignee_id"):
        if not getattr(primary, f):
            setattr(primary, f, getattr(other, f))
    if other.last_contact_at and (not primary.last_contact_at or other.last_contact_at > primary.last_contact_at):
        primary.last_contact_at = other.last_contact_at
    primary.save()
    primary.tags.add(*other.tags.all())
    primary.refresh_search()
    Contact.objects.filter(pk=other.pk).update(merged_into=primary, archived_at=timezone.now(), name_key="")
    Activity.objects.create(type=Activity.Type.SYSTEM, contact=primary, created_by=by, done_at=timezone.now(),
                            subject=f"دُمج معه العميل «{other.display_name}» (#{other.pk})")
    publish(Event.CLIENT_CHANGED, id=primary.pk)
    return primary


def search_q(q: str) -> Q:
    from apps.core.text import name_key, normalize_ar

    digits = "".join(ch for ch in q if ch.isdigit())
    cond = Q(search_text__icontains=normalize_ar(q)) | Q(name_key__icontains=name_key(q) or "\0")
    if len(digits) >= 4:
        cond |= Q(phones__number__contains=digits.lstrip("0"))
    return cond
