"""Auth/CSRF, files, notifications, settings, realtime transactionality, import."""

import io
import json
from pathlib import Path

import psycopg
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection, transaction
from PIL import Image
from rest_framework.test import APIClient

from apps.realtime.events import CHANNEL, publish
from tests.conftest import later

PDF = b"%PDF-1.4\n%%EOF"


@pytest.mark.django_db
def test_login_csrf_and_401(user):
    c = APIClient(enforce_csrf_checks=True)
    assert c.get("/api/v1/contacts/").status_code == 401
    assert c.post("/api/v1/auth/login/", {"username": "staff", "password": "s3cret-pass!"}, format="json"
                  ).status_code == 403
    token = c.get("/api/v1/auth/csrf/").cookies["csrftoken"].value
    r = c.post("/api/v1/auth/login/", {"username": "staff", "password": "s3cret-pass!"}, format="json",
               HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 200 and r.json()["can_delete"] is False


@pytest.mark.django_db
def test_upload_and_view_document(api, contact):
    r = api.post("/api/v1/documents/", {"file": SimpleUploadedFile("عقد.pdf", PDF), "contact_id": contact.pk,
                                        "category": "CONTRACT"}, format="multipart")
    assert r.status_code == 201, r.json()
    f = api.get(r.json()["url"])
    assert f.status_code == 200 and f["X-Frame-Options"] == "SAMEORIGIN"
    buf = io.BytesIO()
    Image.new("RGB", (2, 2)).save(buf, "PNG")
    bad = api.post("/api/v1/documents/", {"file": SimpleUploadedFile("x.jpg", buf.getvalue()),
                                          "contact_id": contact.pk}, format="multipart")
    assert bad.status_code == 400


@pytest.mark.django_db
def test_notifications_tick_reminder_digest_and_mute(user, contact, settings):
    from datetime import datetime

    from django.utils import timezone

    from apps.activities.services import plan_activity
    from apps.deals.services import create_deal
    from apps.notifications.models import Notification, NotificationPreference
    from apps.notifications.services import tick

    deal = create_deal(kind="FINISHING", contact=contact, assignee=user)
    noon = timezone.make_aware(datetime(2026, 11, 6, 12, 0))
    plan_activity(contact=contact, deal=deal, type="SITE_VISIT", due_at=noon + (later(minutes=30) - later()),
                  by=user)
    out = tick(now=noon)
    assert out["due"] == 1 and out["digest"] == 1
    assert tick(now=noon) == {"due": 0, "digest": 0, "overdue": 0}  # idempotent
    night = timezone.make_aware(datetime(2026, 11, 6, 22, 0))
    plan_activity(contact=contact, deal=deal, type="CALL", due_at=night + (later(minutes=20) - later()), by=user)
    assert tick(now=night)["due"] == 0  # quiet hours: no push
    NotificationPreference.objects.create(user=user, kind="ACTIVITY_OVERDUE", muted=True)
    assert tick(now=timezone.make_aware(datetime(2026, 11, 7, 20, 30)))["overdue"] == 0
    assert Notification.objects.filter(kind="DIGEST", day="2026-11-06").count() == 1  # one digest per day


@pytest.mark.django_db
def test_settings_hide_password_and_admin_only(api, admin_api):
    assert api.get("/api/v1/admin/settings/").status_code == 403
    r = admin_api.patch("/api/v1/admin/settings/", {"smtp_username": "a@gmail.com", "smtp_password": "app-pass",
                                                    "email_enabled": True}, format="json")
    assert r.status_code == 200 and "smtp_password" not in r.json() and r.json()["smtp_password_set"] is True
    r = admin_api.patch("/api/v1/admin/settings/", {"smtp_password": ""}, format="json")  # blank keeps it
    assert r.json()["smtp_password_set"] is True


@pytest.mark.django_db
def test_admin_creates_user_with_delete_permission(admin_api):
    r = admin_api.post("/api/v1/admin/users/", {"username": "rand2", "name": "Rand", "password": "Long-pass-123",
                                                "can_delete_input": True}, format="json")
    assert r.status_code == 201, r.json()
    assert r.json()["can_delete"] is True


@pytest.mark.django_db(transaction=True)
def test_publish_only_on_commit():
    s = connection.settings_dict
    conn = psycopg.connect(host=s["HOST"], port=s["PORT"], user=s["USER"], dbname=s["NAME"], autocommit=True)
    conn.execute(f"LISTEN {CHANNEL}")
    with pytest.raises(RuntimeError), transaction.atomic():
        publish("request.changed", id=1)
        raise RuntimeError
    with transaction.atomic():
        publish("request.changed", id=2)
    got = [json.loads(n.payload)["data"] for n in conn.notifies(timeout=0.5, stop_after=5)]
    conn.close()
    assert got == [{"id": 2}]


@pytest.mark.django_db
def test_import_sheets(tmp_path, user):
    from django.contrib.auth import get_user_model

    from apps.contacts.models import Contact
    from apps.deals.models import Deal
    from apps.properties.models import Property

    get_user_model().objects.create_user("ahmad")
    leads = tmp_path / "leads.csv"
    leads.write_text(
        "التاريخ,اسم العميل , رقم العميل,نوع الخدمة,المنطقة,نوع العقار,الرنج السعري,حالة العميل,اهمية العميل,"
        "مصدر العميل,اخر تواصل,تاريخ المتابعة القادمة ,متابعة العميل,ملاحظات العميل,موعد المعاينة,توقيت المعاينة,"
        "حالة المعاينة,نتيجة المعاينة ,الخطوة القادمة,حالة الدراسة,تاريخ ارسال الدراسة,ملاحظات مابعد تقديم الدراسة,"
        "موعد الاتفاق,توقيت الاتفاق,نتيجة الاتفاق\n"
        "2026/08/09,أحمد مرعشلي,0949379686,اكساء,داريا,شقة 160 م,------,تم تحديد موعد للمعاينة,Hot,واتس,"
        "2026/08/31,,,,2026/08/10,5:30م,تمت,,متابعة العميل,الدراسة قدمت,18/8/2026,,,,\n"
        "13/8/2026,,949 379 686,اكساء,حلب,شقة,,بمحافظة اخرى,,واتس م.دانا,2026/08/13,,,,,,,,,,,,,,\n"
        "13/8/2026,,933 000 111,اكساء,,,,تم التواصل,,واتس,2026/08/13,,,استفسار ولم يعد يتواصل,,,,,,,,,,,\n",
        encoding="utf-8")
    props = tmp_path / "props.csv"
    props.write_text(
        "رقم العقار ,نوع العقار ,المساحة ,عدد الغرف ,الطابق,حالة العقار,نوع الخدمة ,المحافظة ,المنطقة ,"
        "العنوان بالتفصيل ,رابط اللوكيشن ,تفاصيل العقار ,اسم العميل ,رقم الهاتف,رقم الواتس ,صفة المتواصل ,الرنج ,"
        "قابل للتفاوض ؟,ملاحظات السعر ,نوع الملكية ,رابط الصور ,رابط المخطط,حالة العرض ,مسؤول العقار ,اخر تواصل ,"
        "موعد المتابعة القادمة ,ملاحظات \n"
        "1-205,شقة ,100م,4غرف وحمامين,ط2,,للبيع ,دمشق,الشعلان ,جانب دار السلام ,,,مرح,941386766,,,\"170,000$\","
        "نعم,,طابو اخضر ,,,,,,,\n"
        ",شقة ,100م_120م,,,,شراء,ريف دمشق ,ضاحية الفردوس ,,,,فراس ,0971563334567,,,\"80,000$\",,,,,,,,,,\n",
        encoding="utf-8")
    call_command("import_sheets", leads=str(leads), properties=str(props))  # dry run
    assert Contact.objects.count() == 0
    call_command("import_sheets", leads=str(leads), properties=str(props), commit=True, stdout=io.StringIO())
    assert Contact.objects.filter(phones__number="+963949379686").count() == 1  # same phone -> one person
    marashli = Contact.objects.get(phones__number="+963949379686")
    assert marashli.deals.count() == 2
    assert {d.stage.name for d in marashli.deals.all()} == {"دراسة", "خسارة"}
    assert Deal.objects.get(contact__phones__number="+963933000111").lost_reason.name == "استفسر وانقطع"
    p = Property.objects.get()
    assert (p.price, p.rooms, p.bathrooms, p.floor, p.legacy_code) == (170000, 4, 2, 2, "1-205")
    assert p.ownership_type.name == "طابو أخضر" and "قابل للتفاوض" in p.description
    buy = Deal.objects.get(kind="BUY")
    assert (buy.demand.area_min, buy.demand.area_max, buy.demand.budget_max) == (100, 120, 80000)
    assert Path(leads).exists()
