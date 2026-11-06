import pytest

from apps.contacts.models import Contact, ContactPhone
from apps.contacts.services import possible_duplicates
from apps.core.text import name_key, normalize_phone

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("raw,expected", [
    ("0933418288", "+963933418288"), ("933418288", "+963933418288"), ("00963933418288", "+963933418288"),
    ("963 944 441 460", "+963944441460"), ("٠٩٣٣٤١٨٢٨٨", "+963933418288"), ("49 160 1897550", "+491601897550"),
    ("961 3 226 416", "+9613226416"), ("0986 373 567" + chr(0x2069), "+963986373567"),
    ("99207977", None), ("Baraa", None), ("", None),
])
def test_phone_normalization(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("a,b", [("أحمد مرعشلي", "احمد مرعشلي"), ("عبد الله القباني", "عبدالله القباني"),
                                 ("م.محمود", "محمود"), ("الدكتورة رنا", "رنا"), ("ابو محمد", "أبو محمد")])
def test_name_key_folds_variants(a, b):
    assert name_key(a) == name_key(b)


def test_same_number_in_any_format_is_blocked(api, contact):
    r = api.post("/api/v1/contacts/", {"name": "غيره", "phones": [{"number": "933418288"}]}, format="json")
    assert r.status_code == 400
    assert "أحمد سليمان" in r.json()["errors"]["phones"][0]
    r = api.get("/api/v1/contacts/check-phone/", {"phone": "+963 933 418 288"})
    assert r.json()["contact"]["id"] == contact.pk


def test_contact_without_name_shows_phone(api):
    r = api.post("/api/v1/contacts/", {"phones": [{"number": "0944111222"}]}, format="json")
    assert r.status_code == 201, r.json()
    assert r.json()["display_name"] == "+963944111222"


def test_search_by_name_variant_or_local_number(api, contact):
    assert api.get("/api/v1/contacts/", {"search": "احمد"}).json()["count"] == 1
    assert api.get("/api/v1/contacts/", {"search": "0933418"}).json()["count"] == 1


def test_duplicates_ignore_single_first_names(user):
    from apps.contacts.services import create_contact

    create_contact(name="عمر", phones=["0944000001"], by=user)
    create_contact(name="عمر", phones=["0944000002"], by=user)
    a = create_contact(name="ماهر أبو زاكن", phones=["0944000003"], by=user)
    b = create_contact(name="ماهر ابو زاكن", phones=["0944000004"], by=user)
    pairs = possible_duplicates()
    assert [{p["a"], p["b"]} for p in pairs] == [{a.pk, b.pk}]


def test_merge_moves_everything_and_archives_other(admin_api, admin, user, lookup):
    from apps.activities.services import log_activity
    from apps.contacts.services import create_contact
    from apps.deals.services import create_deal

    a = create_contact(name="معاذ الشاعر", phones=["0944000010"], by=user)
    b = create_contact(name="معاذ الشاعر", phones=["0944000011"], by=user, notes="ملاحظة قديمة")
    deal = create_deal(kind="BUY", contact=b, by=user)
    log_activity(contact=b, deal=deal, type="CALL", by=user)
    r = admin_api.post(f"/api/v1/contacts/{a.pk}/merge/", {"other_id": b.pk}, format="json")
    assert r.status_code == 200, r.json()
    assert sorted(ContactPhone.objects.filter(contact=a).values_list("number", flat=True)) == [
        "+963944000010", "+963944000011"]
    deal.refresh_from_db()
    assert deal.contact_id == a.pk and a.activities.exclude(type="SYSTEM").count() == 1
    b.refresh_from_db()
    assert b.merged_into_id == a.pk and b.archived_at is not None
    assert "ملاحظة قديمة" in Contact.objects.get(pk=a.pk).notes


def test_hard_delete_needs_permission(api, admin_api, user):
    from apps.contacts.services import create_contact

    c = create_contact(name="x", phones=["0944000020"], by=user)
    assert api.delete(f"/api/v1/contacts/{c.pk}/").status_code == 403
    assert admin_api.delete(f"/api/v1/contacts/{c.pk}/").status_code == 204
    assert api.patch(f"/api/v1/contacts/{c.pk}/", {"is_archived": True}, format="json").status_code == 404


def test_audit_log_records_changes(api, contact):
    api.patch(f"/api/v1/contacts/{contact.pk}/", {"notes": "تغيير"}, format="json")
    entries = api.get("/api/v1/audit/", {"model": "contact", "id": contact.pk}).json()
    assert {"field": "ملاحظات", "old": "—", "new": "تغيير"} in entries[0]["changes"]
    assert entries[-1]["action"] == "أنشأ" and entries[-1]["changes"] == []


def test_audit_log_is_readable_for_links_and_tags(api, admin_api, contact, admin):
    from apps.catalog.models import Tag

    tag = Tag.objects.create(name="VIP")
    admin_api.patch(f"/api/v1/contacts/{contact.pk}/", {"assignee_id": admin.pk, "tag_ids": [tag.pk]}, format="json")
    changes = [c for e in api.get("/api/v1/audit/", {"model": "contact", "id": contact.pk}).json()
               for c in e["changes"]]
    assert {"field": "الوسوم", "old": "", "new": "+ VIP"} in changes
    assignee = next(c for c in changes if c["field"] == "المسؤول")
    assert assignee["new"] == str(admin)  # a name, not a pk


def test_backfill_last_contact_from_imported_history(contact):
    from apps.activities.models import Activity
    from apps.activities.services import backfill_last_contact
    from tests.conftest import ago

    Activity.objects.create(contact=contact, type=Activity.Type.WHATSAPP, done_at=ago(days=10))
    Activity.objects.create(contact=contact, type=Activity.Type.TASK, done_at=ago(days=1))  # not contact
    assert backfill_last_contact() == 1
    contact.refresh_from_db()
    assert (ago(days=10) - contact.last_contact_at).total_seconds() < 5
    assert backfill_last_contact() == 0
