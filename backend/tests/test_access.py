"""Roles & permissions: scopes (none / own / all), on/off actions, money fields, admin area, the roles API."""

import pytest
from django.contrib.auth import get_user_model

from apps.access.models import Role
from apps.contacts.services import create_contact
from apps.deals.services import create_deal
from tests.conftest import client_for, with_role

pytestmark = pytest.mark.django_db
User = get_user_model()


def person(username, role):
    return with_role(User.objects.create_user(username, password="s3cret-pass!", first_name=username), role)


@pytest.fixture
def boss_contact(admin):
    return create_contact(name="عميل المدير", phones=["0933 000 001"], by=admin)


def test_agent_sees_everything_but_edits_only_own(api, user, boss_contact):
    mine = create_contact(name="عميلي", phones=["0933 000 002"], by=user)
    assert api.get("/api/v1/contacts/").json()["count"] == 2  # contacts.view = all
    assert api.patch(f"/api/v1/contacts/{boss_contact.pk}/", {"notes": "x"}, format="json").status_code == 403
    assert api.patch(f"/api/v1/contacts/{mine.pk}/", {"notes": "x"}, format="json").status_code == 200
    assert api.delete(f"/api/v1/contacts/{mine.pk}/").status_code == 403  # contacts.delete = none
    assert api.get("/api/v1/contacts/duplicates/").status_code == 403  # no merge right
    # every record says what the user may do with it, for the UI
    assert api.get(f"/api/v1/contacts/{boss_contact.pk}/").json()["access"] == {"edit": False, "delete": False}
    assert api.get(f"/api/v1/contacts/{mine.pk}/").json()["access"] == {"edit": True, "delete": False}


def test_own_scope_hides_other_records(admin, boss_contact):
    eng = person("eng", "engineer")
    theirs = create_deal(kind="FINISHING", contact=boss_contact, by=admin)
    as_engineer = create_deal(kind="FINISHING", contact=boss_contact, by=admin, engineer=eng)
    c = client_for(eng)
    ids = [d["id"] for d in c.get("/api/v1/deals/").json()["results"]]
    assert ids == [as_engineer.pk]  # deals.view = own (assignee or engineer)
    assert c.get(f"/api/v1/deals/{theirs.pk}/").status_code == 404
    assert c.get("/api/v1/timeline/", {"deal": theirs.pk}).status_code == 404
    assert sum(r["count"] for r in c.get("/api/v1/deals/stage-counts/").json()) == 1
    assert [d["id"] for d in c.get("/api/v1/search/", {"q": "عميل"}).json()["deals"]] == [as_engineer.pk]
    # engineers write studies on their own requests
    r = c.post("/api/v1/quotes/", {"deal_id": as_engineer.pk, "amount": "9000"}, format="json")
    assert r.status_code == 201, r.json()


def test_money_is_hidden_and_protected(api, user, admin_api, boss_contact):
    deal = create_deal(kind="FINISHING", contact=boss_contact, by=user, expected_amount=5000)
    viewer = client_for(person("viewer", "viewer"))
    body = viewer.get(f"/api/v1/deals/{deal.pk}/").json()
    assert body["expected_amount"] is None and body["contract_amount"] is None  # finance.view off
    assert viewer.get("/api/v1/quotes/", {"deal": deal.pk}).status_code == 403
    # an agent sees amounts but can't set the contract value; unchanged values pass through
    assert api.get(f"/api/v1/deals/{deal.pk}/").json()["expected_amount"] == "5000.00"
    r = api.patch(f"/api/v1/deals/{deal.pk}/", {"contract_amount": "8000"}, format="json")
    assert r.status_code == 400 and "contract_amount" in r.json()["errors"]
    assert api.patch(f"/api/v1/deals/{deal.pk}/", {"title": "جديد", "contract_amount": None},
                     format="json").status_code == 200
    assert admin_api.patch(f"/api/v1/deals/{deal.pk}/", {"contract_amount": "8000"}, format="json").status_code == 200


def test_viewer_cannot_create_anything(boss_contact):
    c = client_for(person("viewer", "viewer"))
    assert c.post("/api/v1/contacts/", {"name": "x", "phones": ["0944 111 222"]}, format="json").status_code == 403
    assert c.post("/api/v1/deals/", {"kind": "FINISHING", "contact_id": boss_contact.pk},
                  format="json").status_code == 403
    assert c.post("/api/v1/activities/", {"type": "CALL", "contact_id": boss_contact.pk},
                  format="json").status_code == 403


def test_admin_area_needs_admin_permissions(api, admin_api):
    for url in ("/api/v1/admin/users/", "/api/v1/admin/roles/", "/api/v1/admin/settings/", "/api/v1/reports/"):
        assert api.get(url).status_code == 403, url
        assert admin_api.get(url).status_code == 200, url
    assert api.get("/api/v1/catalog/sources/").status_code == 200  # lookups: read for everyone
    assert api.post("/api/v1/catalog/sources/", {"name": "x"}, format="json").status_code == 403
    assert api.post("/api/v1/admin/hand-over/", {}, format="json").status_code == 403


def test_team_dashboard_needs_reports_permission(api, user, admin, boss_contact):
    create_deal(kind="FINISHING", contact=boss_contact, by=admin)
    assert api.get("/api/v1/dashboard/", {"scope": "all"}).json()["open_deals"] == 0  # forced to "my day"
    assert client_for(admin).get("/api/v1/dashboard/", {"scope": "all"}).json()["open_deals"] == 1


def test_roles_api(admin_api, user):
    perms = admin_api.get("/api/v1/admin/permissions/").json()
    assert {"key": "deals.view", "group": "الطلبات", "label": "عرض الطلبات", "kind": "scope"} in perms
    r = admin_api.post("/api/v1/admin/roles/", {"slug": "call-center", "name": "كول سنتر",
                                                "permissions": {"contacts.view": "all", "contacts.create": True,
                                                                "bogus": True}}, format="json")
    assert r.status_code == 201, r.json()
    role = r.json()
    assert role["permissions"]["contacts.create"] is True and role["permissions"]["deals.view"] == "none"
    assert "bogus" not in role["permissions"]
    admin_api.patch(f"/api/v1/admin/users/{user.pk}/", {"role_id": role["id"]}, format="json")
    me = client_for(User.objects.get(pk=user.pk)).get("/api/v1/auth/me/").json()
    assert me["role"]["slug"] == "call-center" and me["permissions"]["deals.view"] == "none"
    assert admin_api.delete(f"/api/v1/admin/roles/{role['id']}/").status_code == 400  # in use
    system = Role.objects.get(slug="viewer")
    assert admin_api.delete(f"/api/v1/admin/roles/{system.pk}/").status_code == 400
    admin_role = Role.objects.get(slug="admin")
    r = admin_api.patch(f"/api/v1/admin/roles/{admin_role.pk}/", {"permissions": {"admin.roles": False}},
                        format="json")
    assert r.status_code == 400  # nobody could manage roles any more


def test_documents_delete_is_own_for_agents(api, admin_api, boss_contact):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from tests.test_platform import PDF

    doc = admin_api.post("/api/v1/documents/", {"file": SimpleUploadedFile("a.pdf", PDF),
                                                "contact_id": boss_contact.pk}, format="multipart").json()
    assert api.delete(f"/api/v1/documents/{doc['id']}/").status_code == 403
    mine = api.post("/api/v1/documents/", {"file": SimpleUploadedFile("b.pdf", PDF),
                                           "contact_id": boss_contact.pk}, format="multipart").json()
    assert api.patch(f"/api/v1/documents/{mine['id']}/", {"is_archived": True}, format="json").status_code == 200
