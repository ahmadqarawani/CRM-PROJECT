"""Import the old Google Sheets (CSV or XLSX) into the standard model.

    manage.py import_sheets --leads "ملف العملاء.csv" --properties "ملف العقارات.csv"            # dry run
    manage.py import_sheets --leads ... --properties ... --commit                               # write

Dry run does everything inside a transaction, prints the report, then rolls back.
Rules agreed with the team are in data-import/DATA_MODEL.md (§4)."""

import csv
import re
from collections import Counter
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.activities.models import Activity
from apps.activities.services import backfill_last_contact
from apps.catalog.models import (
    FinishLevel,
    Location,
    LostReason,
    OwnershipType,
    PropertyType,
    Source,
    Tag,
)
from apps.contacts.models import Contact, ContactPhone
from apps.core.text import normalize_ar, normalize_phone
from apps.deals.models import Deal, Demand, FinishingSpec, Quote, Stage
from apps.properties.models import Property

OLD_TAG = "بيانات قديمة - بحاجة تأكيد"
DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


class Rollback(Exception):
    pass


# ---------- parsing helpers ----------
def read_rows(path: str) -> list[dict]:
    p = Path(path)
    if not p.exists():
        raise CommandError(f"file not found: {path}")
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        import openpyxl

        ws = openpyxl.load_workbook(p, read_only=True, data_only=True).active
        rows = [[("" if c is None else str(c)) for c in r] for r in ws.iter_rows(values_only=True)]
    else:
        with p.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.reader(f))
    head = [h.strip() for h in rows[0]]
    return [dict(zip(head, [c.strip() for c in r])) for r in rows[1:] if any(c.strip() for c in r)]


def parse_date(raw: str) -> date | None:
    raw = (raw or "").translate(DIGITS).strip()
    m = re.match(r"^(\d{1,4})/(\d{1,2})/(\d{1,4})$", raw)
    if not m:
        return None
    a, b, c = (int(x) for x in m.groups())
    y, mo, d = (a, b, c) if a > 31 or len(m.group(1)) == 4 else (c, b, a)
    if y < 1000:  # "0206/08/11" typo -> 2026
        y = 2026
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def parse_time(raw: str) -> time:
    raw = (raw or "").translate(DIGITS)
    m = re.search(r"(\d{1,2}):(\d{2})", raw)
    if not m:
        return time(12, 0)
    h, mi = int(m.group(1)), int(m.group(2))
    if ("م" in raw or "pm" in raw.lower()) and h < 12:
        h += 12
    return time(min(h, 23), mi)


def at(d: date | None, t: time = time(12, 0)) -> datetime | None:
    return timezone.make_aware(datetime.combine(d, t)) if d else None


def first_number(raw: str) -> Decimal | None:
    m = re.search(r"(\d[\d,\.]*)", (raw or "").translate(DIGITS))
    if not m:
        return None
    try:
        return Decimal(m.group(1).replace(",", ""))
    except InvalidOperation:
        return None


def numbers(raw: str) -> list[Decimal]:
    return [Decimal(x.replace(",", "")) for x in re.findall(r"\d[\d,]*(?:\.\d+)?", (raw or "").translate(DIGITS))]


def usd_amount(raw: str) -> tuple[Decimal | None, Decimal | None]:
    """'170,000$' -> (170000, None); '110,000$_120,000$' -> (110000, 120000); anything in SYP or per m² -> None."""
    raw = (raw or "").strip()
    if not raw or "$" not in raw or re.search(r"متر|دونم|ل\.?س|مليون|مليار|اجار", raw):
        return None, None
    nums = [n for n in numbers(raw.split("\n")[0]) if n >= 100]
    if not nums:
        return None, None
    return (nums[0], nums[1]) if len(nums) > 1 else (nums[0], None)


ROOM_WORDS = {"غرفتين": 2, "غرفة": 1, "غرفه": 1}
LEVEL_WORDS = [("سوبر", "سوبر ديلوكس"), ("ديلوكس", "ديلوكس"), ("عضم", "عضم"), ("قديم", "كسوة قديمة"),
               ("عادي", "كسوة عادية"), ("جيد", "كسوة جيدة"), ("ممتاز", "كسوة جيدة"), ("مكسي", "كسوة جيدة")]
TYPE_WORDS = [("دوبلكس", "دوبلكس"), ("بيت عربي", "منزل عربي"), ("منزل عربي", "منزل عربي"), ("فيلا", "منزل / فيلا"),
              ("ڤيلا", "منزل / فيلا"), ("منزل", "منزل / فيلا"), ("محل", "محل تجاري"), ("سوبر ماركت", "محل تجاري"),
              ("مكتب", "مكتب"), ("مخبر", "مكتب"), ("معمل", "معمل / مستودع"), ("ارض", "أرض"), ("اراضي", "أرض"),
              ("بناء", "بناء كامل"), ("شق", "شقة"), ("مطبخ", "شقة")]


def rooms_of(raw: str) -> int | None:
    raw = normalize_ar(raw)
    for w, n in ROOM_WORDS.items():
        if raw.startswith(w):
            return n
    m = re.match(r"(\d+)\s*(?:غرف|وصال|و\s*صال|\+)", raw)
    return int(m.group(1)) if m else None


def baths_of(raw: str) -> int | None:
    raw = normalize_ar(raw)
    if "حمامين" in raw:
        return 2
    return 1 if "حمام" in raw else None


def floor_of(raw: str) -> int | None:
    raw = normalize_ar(raw)
    if raw.startswith("قبو"):
        return -1
    if raw.startswith("ارضي"):
        return 0
    m = re.fullmatch(r"ط\s*(\d+)", raw)
    return int(m.group(1)) if m else None


class Command(BaseCommand):
    help = "Import the old sheets (dry run unless --commit)."

    def add_arguments(self, parser):
        parser.add_argument("--leads")
        parser.add_argument("--properties")
        parser.add_argument("--commit", action="store_true")
        parser.add_argument("--assignee", default="ahmad")

    # ---------- shared lookups ----------
    def setup(self, assignee):
        User = get_user_model()
        self.user = User.objects.get(username=assignee)
        self.r = Counter()
        self.notes: list[str] = []
        self.now = timezone.now()
        self.whatsapp = Source.objects.get(name="واتساب")
        self.old_tag, _ = Tag.objects.get_or_create(name=OLD_TAG)
        self.stages = {(s.pipeline, s.name): s for s in Stage.objects.all()}
        self.lost = {lr.name: lr for lr in LostReason.objects.all()}
        self.levels = {lv.name: lv for lv in FinishLevel.objects.all()}
        self.ptypes = {t.name: t for t in PropertyType.objects.all()}
        self._locations = {normalize_ar(lc.name): lc for lc in Location.objects.all()}

    def location(self, raw: str) -> Location | None:
        name = (raw or "").split("\n")[0].strip(" ,.-")
        if not name:
            return None
        key = normalize_ar(name)
        if key not in self._locations:
            self._locations[key] = Location.objects.create(name=name)
            self.r["new locations"] += 1
        return self._locations[key]

    def level(self, raw: str) -> FinishLevel | None:
        raw = normalize_ar(raw)
        for word, name in LEVEL_WORDS:
            if word in raw:
                return self.levels[name]
        return None

    def ptype(self, raw: str) -> PropertyType | None:
        raw = normalize_ar(raw)
        for word, name in TYPE_WORDS:
            if normalize_ar(word) in raw:
                return self.ptypes[name]
        return None

    def contact(self, name: str, phone_cell: str, row_label: str, created: datetime | None = None) -> Contact | None:
        raw_numbers = [x for x in re.split(r"[\n/]", phone_cell or "") if x.strip()]
        good = [n for n in (normalize_phone(x) for x in raw_numbers) if n]
        bad = [x.strip() for x in raw_numbers if not normalize_phone(x)]
        if bad:
            self.r["invalid phone (kept in notes)"] += len(bad)
            self.notes.append(f"{row_label}: رقم غير صالح {bad}")
        existing = Contact.objects.filter(phones__number__in=good).first() if good else None
        if existing:
            self.r["rows merged into an existing contact (same phone)"] += 1
            if name and not existing.name:
                existing.name = name
                existing.save()
            for n in good:
                if not ContactPhone.objects.filter(number=n).exists():
                    ContactPhone.objects.create(contact=existing, number=n, has_whatsapp=True)
            existing.refresh_search()
            return existing
        if not good and not name:
            self.r["skipped: no name and no valid phone"] += 1
            self.notes.append(f"{row_label}: تخطّي (لا اسم ولا رقم صالح: {phone_cell!r})")
            return None
        c = Contact.objects.create(name=name, source=self.whatsapp, assignee=self.user,
                                   notes=("أرقام غير صالحة من الشيت: " + "، ".join(bad)) if bad else "")
        for i, n in enumerate(good):
            ContactPhone.objects.create(contact=c, number=n, is_primary=i == 0, has_whatsapp=True)
        c.refresh_search()
        if created:
            Contact.objects.filter(pk=c.pk).update(created_at=created)
        self.r["contacts created"] += 1
        return c

    def activity(self, **kw) -> Activity:
        kw.setdefault("assignee", self.user)
        kw.setdefault("created_by", self.user)
        return Activity.objects.create(**kw)

    # ---------- leads sheet ----------
    def import_leads(self, rows):
        for i, row in enumerate(rows, start=2):
            label = f"عملاء سطر {i}"
            created_d = parse_date(row.get("التاريخ"))
            created = at(created_d)
            c = self.contact(row.get("اسم العميل", ""), row.get("رقم العميل", ""), label, created)
            if not c:
                continue
            service = normalize_ar(row.get("نوع الخدمة"))
            kind = {"شراء": Deal.Kind.BUY, "اجار": Deal.Kind.RENT, "بيع": Deal.Kind.SELL}.get(service,
                                                                                            Deal.Kind.FINISHING)
            pipeline = "FINISHING" if kind == Deal.Kind.FINISHING else "BROKERAGE"
            status = normalize_ar(row.get("حالة العميل"))
            notes = row.get("ملاحظات العميل", "")
            n_notes = normalize_ar(notes)
            area_text = row.get("المنطقة", "")
            prop_text = row.get("نوع العقار", "")
            study = normalize_ar(row.get("حالة الدراسة"))

            # stage + lost reason (rules in DATA_MODEL.md)
            lost = None
            if status == "غير مهتم":
                lost = "غير مهتم"
            elif status == "بمحافظه اخري":
                lost = None if "درعا" in normalize_ar(area_text) else "خارج منطقة الخدمة"
            if not lost:
                if re.search(r"ازاله العميل|الزاله العميل", n_notes):
                    lost = "إزالة بطلب الإدارة"
                elif re.search(r"السعر غالي|ميزانيته قليله|مشكله في السعر", n_notes):
                    lost = "السعر غالي / الميزانية قليلة"
                elif re.search(r"بلاط فقط|دهان فقط", n_notes):
                    lost = "خدمة لا نقدمها"
                elif re.search(r"لم يعد يتواصل|لم يعد يرد|لم بعد يتواصل|لم لعد يتواصل|ولم يعد|لم يتواصل|لم يرد|"
                               r"مجرد استفسار|استفسار فقط|فقط استفسار|ترحيب فقط|مجرد ترحيب", n_notes) \
                        and status not in ("تم تحديد موعد للمعاينه",):
                    lost = "استفسر وانقطع"
            if lost:
                stage = self.stages[(pipeline, "خسارة")]
            elif pipeline == "BROKERAGE":
                stage = self.stages[(pipeline, "جديد")]
            elif "الدراسه" in study:
                stage = self.stages[(pipeline, "دراسة")]
            elif status in ("تم تحديد موعد للمعاينه", "بانتظار تحديد موعد للمعاينه"):
                stage = self.stages[(pipeline, "معاينة")]
            elif status == "بانتظار الرد":
                stage = self.stages[(pipeline, "إرسال الكتالوج")]
            else:
                stage = self.stages[(pipeline, "جديد")]
            self.r[f"deal stage: {stage.pipeline}/{stage.name}"] += 1
            if lost:
                self.r[f"lost reason: {lost}"] += 1

            temp = {"hot": "HOT", "warm": "WARM", "cold": "COLD"}.get(row.get("اهمية العميل", "").strip().lower(), "")
            title = " — ".join(filter(None, [prop_text.split("\n")[0], area_text.split("\n")[0]]))[:200]
            last_contact = parse_date(row.get("اخر تواصل"))
            deal = Deal.objects.create(
                kind=kind, contact=c, stage=stage, title=title or row.get("نوع الخدمة", ""), temperature=temp,
                source=self.whatsapp, assignee=self.user, location=self.location(area_text),
                address=area_text.replace("\n", " ، "), lost_reason=self.lost.get(lost) if lost else None,
                closed_at=at(last_contact or created_d) if lost else None, last_contact_at=at(last_contact),
            )
            deal.tags.add(self.old_tag)
            Deal.objects.filter(pk=deal.pk).update(created_at=created or self.now,
                                                   stage_entered_at=at(last_contact or created_d) or self.now)
            budget = row.get("الرنج السعري", "").strip(" -")
            if kind == Deal.Kind.FINISHING:
                FinishingSpec.objects.create(deal=deal, property_note=prop_text.replace("\n", " ")[:300],
                                             area_m2=first_number(prop_text), property_type=self.ptype(prop_text),
                                             current_level=self.level(prop_text))
            elif kind in (Deal.Kind.BUY, Deal.Kind.RENT):
                d = Demand.objects.create(deal=deal, notes=prop_text)
                if t := self.ptype(prop_text):
                    d.property_types.add(t)
                if loc := deal.location:
                    d.locations.add(loc)

            # history: the last contact (with the sheet's notes), the follow-up, the inspection, the study
            extra = "؛ ".join(filter(None, [notes, f"الميزانية: {budget}" if budget else "",
                                            row.get("متابعة العميل", ""), row.get("نتيجة الاتفاق", "")]))
            if last_contact or extra:
                self.activity(type=Activity.Type.WHATSAPP, contact=c, deal=deal, notes=extra,
                              subject="تواصل (من الشيت القديم)", done_at=at(last_contact or created_d) or self.now)
                self.r["activities: logged contact"] += 1
            if row.get("موعد المعاينة"):
                when = at(parse_date(row["موعد المعاينة"]), parse_time(row.get("توقيت المعاينة", "")))
                vstat = normalize_ar(row.get("حالة المعاينة"))
                done = vstat.startswith(("تمت", "الغيت", "اجلت"))
                self.activity(type=Activity.Type.SITE_VISIT, contact=c, deal=deal, subject="معاينة", due_at=when,
                              done_at=when if done else None, outcome=row.get("حالة المعاينة", ""))
                self.r["activities: site visits"] += 1
            if "الدراسه" in study:
                sent = parse_date(row.get("تاريخ ارسال الدراسة"))
                Quote.objects.create(deal=deal, version=1, created_by=self.user,
                                     status=Quote.Status.SENT if "قدمت" in study else Quote.Status.DRAFT,
                                     sent_at=at(sent), notes=row.get("ملاحظات مابعد تقديم الدراسة", ""))
                self.r["quotes"] += 1
            if not lost:
                nxt = parse_date(row.get("تاريخ المتابعة القادمة"))
                step = normalize_ar(row.get("الخطوة القادمة"))
                if nxt:
                    self.activity(type=Activity.Type.CALL, contact=c, deal=deal, subject="متابعة", due_at=at(nxt, time(11)))
                    self.r["activities: planned follow-ups (from sheet)"] += 1
                elif status == "بانتظار تحديد موعد للمعاينه":
                    self.activity(type=Activity.Type.TASK, contact=c, deal=deal, subject="تحديد موعد المعاينة",
                                  due_at=self.now + timedelta(days=1))
                    self.r["activities: planned 'set inspection date'"] += 1
                elif "ارسال الدراسه" in step:
                    self.activity(type=Activity.Type.TASK, contact=c, deal=deal, subject="إرسال الدراسة",
                                  due_at=self.now + timedelta(days=1))
                    self.r["activities: planned 'send the study'"] += 1

    # ---------- properties sheet ----------
    def import_properties(self, rows):
        own = {normalize_ar(o.name): o for o in OwnershipType.objects.all()}
        for i, row in enumerate(rows, start=2):
            g = lambda k, row=row: row.get(k, row.get(k + " ", "")).strip()  # headers have stray spaces
            label = f"عقارات سطر {i}"
            c = self.contact(g("اسم العميل"), g("رقم الهاتف") + ("\n" + g("رقم الواتس") if g("رقم الواتس") else ""),
                             label)
            if not c:
                continue
            c.tags.add(self.old_tag)
            service = normalize_ar(g("نوع الخدمة"))
            ptext, area_txt, price_txt = g("نوع العقار"), g("المساحة"), g("الرنج")
            region = g("المنطقة")
            if service == "شراء":
                deal = Deal.objects.create(kind=Deal.Kind.BUY, contact=c, stage=self.stages[("BROKERAGE", "جديد")],
                                           title=f"يبحث عن {ptext} — {region.splitlines()[0] if region else ''}"[:200],
                                           source=self.whatsapp, assignee=self.user, location=self.location(region),
                                           address=region.replace("\n", " ، "))
                deal.tags.add(self.old_tag)
                nums = [n for n in numbers(area_txt) if n >= 10]
                lo, hi = usd_amount(price_txt)
                d = Demand.objects.create(
                    deal=deal, area_min=nums[0] if len(nums) > 1 else None,
                    area_max=(nums[1] if len(nums) > 1 else (nums[0] if nums else None)),
                    budget_min=lo if hi else None, budget_max=hi or lo, rooms_min=rooms_of(g("عدد الغرف")),
                    notes="؛ ".join(filter(None, [g("ملاحظات"), g("الطابق") and f"الطابق: {g('الطابق')}",
                                                  g("حالة العقار") and f"الحالة: {g('حالة العقار')}",
                                                  price_txt if not (lo or hi) else ""])))
                for part in re.split(r"\n| او ", region):
                    if loc := self.location(part):
                        d.locations.add(loc)
                if t := self.ptype(ptext):
                    d.property_types.add(t)
                if lv := self.level(g("حالة العقار")):
                    d.finish_levels.add(lv)
                self.r["buy requests (from properties sheet)"] += 1
                continue
            state_txt = normalize_ar(g("حالة العقار"))
            building = ("UNDER_CONSTRUCTION" if "قيد الانشاء" in state_txt else "NEW" if "جديد" in state_txt
                        else "USED" if "مستخدم" in state_txt else "")
            price, price_hi = usd_amount(price_txt)
            own_txt = normalize_ar(g("نوع الملكية"))
            ownership = own.get(own_txt) or (OwnershipType.objects.get_or_create(name=g("نوع الملكية"))[0]
                                              if own_txt else None)
            if own_txt and own_txt not in own and ownership:
                own[own_txt] = ownership
            desc = "\n".join(filter(None, [g("تفاصيل العقار"), "قابل للتفاوض" if g("قابل للتفاوض ؟") == "نعم" else "",
                                           g("ملاحظات")]))
            prop = Property.objects.create(
                legacy_code=g("رقم العقار"), owner=c, owner_role="OWNER", property_type=self.ptype(ptext),
                listing="BOTH" if "اجار" in service else "SALE", status="AVAILABLE", location=self.location(region),
                address=" — ".join(filter(None, [g("المحافظة"), region.replace("\n", " ، "), g("العنوان بالتفصيل")])),
                area_m2=first_number(area_txt), area_note=area_txt.replace("\n", " ") if not re.fullmatch(
                    r"\d+\s*م", area_txt) else "", rooms=rooms_of(g("عدد الغرف")), bathrooms=baths_of(g("عدد الغرف")),
                layout_note=g("عدد الغرف"), floor=floor_of(g("الطابق")), floor_note=g("الطابق"),
                building_state=building, finish_level=self.level(g("حالة العقار")), ownership_type=ownership,
                price=None if price_hi else price, price_note=price_txt.replace("\n", " / ") if (price_hi or not price)
                else "", description=desc, assignee=self.user, listed_at=date(2025, 1, 1))
            prop.tags.add(self.old_tag)
            self.r["properties"] += 1
            if not prop.property_type:
                self.notes.append(f"{label}: نوع العقار غير معروف «{ptext}»")
            if price_txt and not prop.price:
                self.r["property price kept as text (SYP / per m² / range)"] += 1

    def handle(self, *args, **opts):
        if not (opts["leads"] or opts["properties"]):
            raise CommandError("give --leads and/or --properties")
        self.setup(opts["assignee"])
        try:
            with transaction.atomic():
                if opts["leads"]:
                    self.import_leads(read_rows(opts["leads"]))
                if opts["properties"]:
                    self.import_properties(read_rows(opts["properties"]))
                self.r["contacts: last contact date set from history"] = backfill_last_contact()
                self.report(opts["commit"])
                if not opts["commit"]:
                    raise Rollback
        except Rollback:
            self.stdout.write(self.style.WARNING("\nDRY RUN — nothing was saved. Re-run with --commit."))
            return
        self.stdout.write(self.style.SUCCESS("\nImported."))

    def report(self, commit):
        self.stdout.write("=== import report ===")
        for k, v in sorted(self.r.items()):
            self.stdout.write(f"  {k}: {v}")
        open_deals = Deal.objects.filter(stage__type="OPEN").count()
        self.stdout.write(f"  -> contacts total: {Contact.objects.count()}, deals: {Deal.objects.count()} "
                          f"(open {open_deals}), properties: {Property.objects.count()}")
        if self.notes:
            self.stdout.write(f"--- {len(self.notes)} notes ---")
            for n in self.notes:
                self.stdout.write(f"  {n}")
