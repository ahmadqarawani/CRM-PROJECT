from decimal import Decimal

import pytest

from apps.activities.services import log_activity, plan_activity
from apps.deals.models import Deal
from apps.deals.overdue import reasons_of, with_attention
from apps.deals.services import create_deal, matching_properties
from apps.properties.models import Property
from tests.conftest import ago, later

pytestmark = pytest.mark.django_db


def attention(deal):
    return reasons_of(with_attention(Deal.objects.filter(pk=deal.pk)).get())


def test_create_finishing_deal_with_spec(api, contact, lookup):
    r = api.post("/api/v1/deals/", {
        "kind": "FINISHING", "contact_id": contact.pk, "title": "إكساء شقة",
        "finishing": {"service_type_id": lookup("ServiceType", "تجديد / إعادة إكساء").pk, "area_m2": "120",
                      "budget_max": "15000"}}, format="json")
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["pipeline"] == "FINISHING" and body["stage"]["name"] == "جديد"
    assert body["finishing"]["service_type"]["name"] == "تجديد / إعادة إكساء"
    assert body["attention_reasons"] == ["NO_NEXT_STEP"]  # standard rule: an open deal needs a next step


def test_lost_requires_reason_and_reopen_clears_it(api, contact, stage, lookup):
    deal = create_deal(kind="FINISHING", contact=contact)
    lost = stage("FINISHING", "خسارة")
    r = api.patch(f"/api/v1/deals/{deal.pk}/", {"stage_id": lost.pk}, format="json")
    assert r.status_code == 400 and "lost_reason_id" in r.json()["errors"]
    reason = lookup("LostReason", "خارج منطقة الخدمة")
    r = api.patch(f"/api/v1/deals/{deal.pk}/", {"stage_id": lost.pk, "lost_reason_id": reason.pk}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "LOST" and r.json()["lost_reason"]["id"] == reason.pk
    assert r.json()["closed_at"] and r.json()["needs_attention"] is False
    r = api.patch(f"/api/v1/deals/{deal.pk}/", {"stage_id": stage("FINISHING", "معاينة").pk}, format="json")
    assert r.json()["status"] == "OPEN" and r.json()["lost_reason"] is None and r.json()["closed_at"] is None


def test_stage_from_other_pipeline_rejected(api, contact, stage):
    deal = create_deal(kind="FINISHING", contact=contact)
    r = api.patch(f"/api/v1/deals/{deal.pk}/", {"stage_id": stage("BROKERAGE", "مؤهَّل").pk}, format="json")
    assert r.status_code == 400


def test_attention_rules(contact, user):
    deal = create_deal(kind="FINISHING", contact=contact)
    assert attention(deal) == ["NO_NEXT_STEP"]
    act = plan_activity(contact=contact, deal=deal, type="CALL", due_at=later(days=1), by=user)
    assert attention(deal) == []
    act.due_at = ago(hours=1)
    act.save()
    assert attention(deal) == ["ACTIVITY_OVERDUE"]
    act.done_at = ago(minutes=1)
    act.save()
    Deal.objects.filter(pk=deal.pk).update(stage_entered_at=ago(days=30))
    assert attention(deal) == ["NO_NEXT_STEP", "STUCK"]


def test_quick_log_updates_last_contact_and_plans_next(api, contact):
    deal = create_deal(kind="FINISHING", contact=contact)
    r = api.post("/api/v1/activities/", {"type": "CALL", "contact_id": contact.pk, "deal_id": deal.pk,
                                         "notes": "رد وطلب معاينة", "next_due": later(days=3).isoformat(),
                                         "next_type": "SITE_VISIT"}, format="json")
    assert r.status_code == 201, r.json()
    deal.refresh_from_db()
    contact.refresh_from_db()
    assert deal.last_contact_at and contact.last_contact_at
    assert deal.activities.filter(done_at__isnull=True, type="SITE_VISIT").count() == 1
    assert attention(deal) == []


def test_complete_activity(api, contact, user):
    deal = create_deal(kind="FINISHING", contact=contact)
    act = plan_activity(contact=contact, deal=deal, type="SITE_VISIT", due_at=ago(hours=1), by=user)
    r = api.post(f"/api/v1/activities/{act.pk}/complete/", {"outcome": "تمت المعاينة",
                                                            "next_due": later(days=2).isoformat()}, format="json")
    assert r.status_code == 200 and r.json()["done_at"]
    assert attention(deal) == []


def test_matching_both_ways(api, contact, user, lookup):
    from apps.contacts.services import create_contact

    apt = lookup("PropertyType", "شقة")
    area = lookup("Location", "المزة") if False else None  # noqa: F841
    from apps.catalog.models import Location

    mazza = Location.objects.create(name="المزة")
    owner = create_contact(name="مالك", phones=["0944000030"], by=user)
    fits = Property.objects.create(owner=owner, property_type=apt, location=mazza, area_m2=110, price=60000, rooms=3)
    Property.objects.create(owner=owner, property_type=apt, location=mazza, area_m2=110, price=90000)  # too expensive
    deal = create_deal(kind="BUY", contact=contact, demand={"budget_max": Decimal(70000), "area_min": Decimal(100),
                                                             "property_types": [apt.pk], "locations": [mazza.pk]})
    assert list(matching_properties(deal.demand)) == [fits]
    r = api.get(f"/api/v1/deals/{deal.pk}/matches/")
    assert [m["property"]["id"] for m in r.json()] == [fits.pk]
    api.post(f"/api/v1/deals/{deal.pk}/match/", {"property_id": fits.pk, "status": "SENT"}, format="json")
    assert api.get(f"/api/v1/deals/{deal.pk}/matches/").json()[0]["status"] == "SENT"
    assert [d["deal_id"] for d in api.get(f"/api/v1/properties/{fits.pk}/demands/").json()] == [deal.pk]


def test_won_sale_marks_property_sold_and_convert_to_finishing(api, contact, user, stage):
    from apps.contacts.services import create_contact

    owner = create_contact(name="مالك", phones=["0944000031"], by=user)
    prop = Property.objects.create(owner=owner, area_m2=100)
    deal = create_deal(kind="BUY", contact=contact, property=prop)
    api.patch(f"/api/v1/deals/{deal.pk}/", {"stage_id": stage("BROKERAGE", "تم").pk}, format="json")
    prop.refresh_from_db()
    assert prop.status == "SOLD"
    r = api.post(f"/api/v1/deals/{deal.pk}/convert-to-finishing/")
    assert r.status_code == 201 and r.json()["kind"] == "FINISHING" and r.json()["contact"]["id"] == contact.pk


def test_quotes_version_and_payments(admin_api, contact):
    api = admin_api  # quotes & payments need finance.manage
    deal = create_deal(kind="FINISHING", contact=contact)
    q1 = api.post("/api/v1/quotes/", {"deal_id": deal.pk, "amount": "12000", "status": "SENT"}, format="json").json()
    q2 = api.post("/api/v1/quotes/", {"deal_id": deal.pk, "amount": "11000"}, format="json").json()
    assert (q1["version"], q2["version"]) == (1, 2) and q1["sent_at"]
    api.patch(f"/api/v1/deals/{deal.pk}/", {"contract_amount": "11000"}, format="json")
    api.post("/api/v1/payments/", {"deal_id": deal.pk, "amount": "4000", "paid_at": "2026-11-01"}, format="json")
    assert api.get(f"/api/v1/deals/{deal.pk}/").json()["paid_amount"] == "4000.00"


def test_hand_over(admin_api, user, admin, contact):
    deal = create_deal(kind="FINISHING", contact=contact, assignee=user)
    plan_activity(contact=contact, deal=deal, type="CALL", due_at=later(days=1), by=user)
    r = admin_api.post("/api/v1/admin/hand-over/", {"from_user_id": user.pk, "to_user_id": admin.pk}, format="json")
    assert r.json()["deals"] == 1 and r.json()["activities"] == 1
    deal.refresh_from_db()
    assert deal.assignee_id == admin.pk


def test_dashboard(api, contact, user):
    deal = create_deal(kind="FINISHING", contact=contact, assignee=user)
    plan_activity(contact=contact, deal=deal, type="CALL", due_at=ago(hours=2), by=user)
    log_activity(contact=contact, type="NOTE", by=user, notes="x")
    body = api.get("/api/v1/dashboard/").json()
    assert len(body["overdue"]) == 1 and body["open_deals"] == 1


def test_stage_counts_follow_the_list_filters(api, contact, user, admin, stage):
    new, catalog = stage("FINISHING", "جديد"), stage("FINISHING", "إرسال الكتالوج")
    for i, st in enumerate([new, new, catalog]):
        create_deal(kind="FINISHING", contact=contact, title=f"شقة {i}", stage=st, assignee=user if i else admin, by=user)
    counts = {r["stage"]: r["count"] for r in api.get("/api/v1/deals/stage-counts/", {"pipeline": "FINISHING"}).json()}
    assert counts == {new.pk: 2, catalog.pk: 1}
    mine = {r["stage"]: r["count"] for r in
            api.get("/api/v1/deals/stage-counts/", {"pipeline": "FINISHING", "assignee": "me"}).json()}
    assert mine == {new.pk: 1, catalog.pk: 1}
    # same numbers the list gives for each stage
    assert api.get("/api/v1/deals/", {"pipeline": "FINISHING", "stage": new.pk}).json()["count"] == 2


def test_property_found_by_its_code(api, contact):
    from apps.properties.models import Property

    p = Property.objects.create(owner=contact, address="المزة")
    assert p.code.startswith("P-")
    found = api.get("/api/v1/search/", {"q": p.code}).json()["properties"]
    assert [x["id"] for x in found] == [p.pk]
    # a code is not a phone fragment: no clients whose numbers happen to contain the digits
    assert api.get("/api/v1/search/", {"q": p.code}).json()["contacts"] == []
    assert api.get("/api/v1/properties/", {"search": p.code.lower()}).json()["count"] == 1
