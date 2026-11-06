# معمارية مشروع CRM: متابعة العملاء والطلبات والشقق

> **الهدف:** نخزّن كل العملاء ببطاقات (cards)، ونتابع كل طلب عبر مراحل (steps). النظام بيبيّن مين متأخر بالرد، وبيذكّر تلقائياً، وبيأرشف الشغل وملفات الـ PDF لكل شقة.

> **المبدأ:** المشروع صغير، يعني عشرات أو مئات العملاء مش ملايين. منختار **أقل عدد أدوات** بيعطي **تصميم صحيح**. كل أداة لازم تبرّر وجودها. وكل شي منأجّله، منصمّمه بطريقة بتسمح نضيفه لاحقاً بدون إعادة بناء.

---

## 0. القرارات

| القرار | الاختيار |
|---|---|
| Backend | **Django 5 + Django REST Framework** |
| ORM / DB | **Django ORM + PostgreSQL** |
| Frontend | **React 19 + Vite (SPA)** |
| Validation | **الـ backend هو المرجع الوحيد (single source of truth)**. ما في Zod |
| Types | **drf-spectacular → OpenAPI → openapi-typescript** |
| Repo | **repo واحد** فيه `backend/` و `frontend/` |
| Auth | **Django session + CSRF**، لأن nginx بيخليهم على نفس الـ origin |
| Jobs | **Django management commands** بتنقدح دورياً (cron/systemd timer عندك)، وكلها idempotent |
| Realtime | **SSE** (`EventSource`) فوق **Postgres `LISTEN/NOTIFY`**. ما في WebSockets ولا Channels ولا Redis (القسم 6.1) |
| تشغيل Django | **ASGI على Granian** (`granian --interface asginl config.asgi:application`). Granian بيحل محل gunicorn و uvicorn، والـ DRF views بتضل sync عادي |
| Admin | `is_staff = True` معناها ADMIN. ما في groups |

**الـ processes:** `postgres` · `granian` · وأمرين مجدولين. ما في Redis ولا worker دايم.

> **الكود الحقيقي موجود بـ `backend/`، وهو المرجع.** أمثلة الكود بهالملف للشرح بس، والقسم 10 بيلخّص اللي تغيّر بعد التشغيل والاختبار.

### شو شلنا ببساطة، وليش

| كان بالخطة | القرار | السبب |
|---|---|---|
| Procrastinate / Celery (worker دايم) | ❌ هلق | الشغل الخلفي الوحيد هو sweep دوري. أمر `manage.py` مجدول بيكفيه. **بيدخل Procrastinate** لما يصير في إرسال واتساب/إيميل بدّه retry |
| PyMuPDF thumbnails | ❌ | `react-pdf` بيرسم أول صفحة بالمتصفح. هيك ما في معالجة على السيرفر وما في queue |
| `django-simple-history` | ❌ | `StageChange` و `Activity` بيغطّوا "مين عمل شو" اللي بيهمنا. ما منحتاج نسخة من كل جدول |
| `pg_trgm` + GIN index | ❌ | مع مئات السجلات، `icontains` على عمود مطبّع (normalized) سريع كفاية |
| ترتيب يدوي للبطاقات (`position`) | ❌ | البطاقات بتترتب لحالها: المتأخر أولاً، وبعدها حسب موعد المتابعة |
| نسخ الملفات (versions) | ❌ | بترفع الملف الجديد وبتأرشف القديم. بيعطي نفس النتيجة بدون منطق إضافي |
| `python-magic` | ❌ | بدّه libmagic. منفحص أول bytes (`%PDF-`) والصور بـ Pillow |
| TanStack Table | ❌ | جداولنا بسيطة، و shadcn `<Table>` بيكفي |
| `AppSetting` model | ❌ | الإعداد الوحيد (`NO_CONTACT_DAYS`) بيكون بالـ settings. والإعدادات اللي بتتغيّر كتير (SLA) أصلاً على الـ `Stage` |

---

## 1. الموديولات

```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard (اليوم): المتأخرين · مهام اليوم · أرقام سريعة       │
├──────────┬──────────────┬──────────────┬─────────────────────┤
│ Clients  │ Requests     │ Apartments   │ Tasks               │
│ بطاقات   │ Kanban مراحل │ شقق + PDF    │ مهام + إشعارات       │
├──────────┴──────────────┴──────────────┴─────────────────────┤
│ Activity Timeline (مكالمة/واتساب/زيارة/ملاحظة/تغيير مرحلة)    │
└──────────────────────────────────────────────────────────────┘
```

- **Clients:** grid بطاقات، وإنشاء سريع (اسم + هاتف). صفحة العميل فيها طلباته وشققه والـ timeline وملفاته.
- **Requests:** أكتر من طلب لكل عميل، وكل طلب بيرتبط اختيارياً بشقة. بالـ Kanban بتسحب الطلب لمرحلة تانية، وكل نقلة بتنسجل.
- **Apartments + Documents:** ملفات مصنّفة لكل شقة، وبتنعرض جوّا التطبيق.
- **Tasks + Notifications:** مهام إلها مواعيد، وإشعارات للمتأخرين.
- **Activity:** أي تواصل بتسجّله بيحدّث `last_contact_at`.
- **Archive:** soft delete بس.

**المراحل الافتراضية** (seed، وبتتعدّل):
طلب جديد → تواصل أولي → معاينة → عرض سعر → بانتظار رد العميل* → عقد → تنفيذ → تسليم → **تم ✓** / **ملغي ✗**

\* `requires_follow_up`: ما بتقدر تنقل الطلب لهون بدون موعد متابعة.
آخر مرحلتين إلهم `closes_as = WON / LOST`، ونقل الطلب لوحدة منهن بيسكّره.

### متى الطلب "متأخر"؟ (مكان واحد: `pipeline/overdue.py`)
الطلب **المفتوح** بيعتبر متأخر إذا تحقق شرط من هدول:
1. `FOLLOWUP_DUE`: موعد المتابعة فات
2. `STAGE_SLA`: صرله بالمرحلة أكتر من `stage.sla_days`
3. `NO_CONTACT`: ما في تواصل من `NO_CONTACT_DAYS` يوم

**التأخير بيتحسب وقت الطلب (query)، وما بينخزّن.** ما في عمود `is_overdue` ممكن يصير قديم وما يطابق الواقع.

---

## 2. هيكلية الـ repo

```
crm/
├─ backend/
│  ├─ config/                 settings.py (واحد + env)، urls.py
│  ├─ apps/
│  │  ├─ core/                base models، normalize_ar، pagination، exception handler، dashboard، search
│  │  ├─ accounts/            session auth endpoints
│  │  ├─ clients/
│  │  ├─ apartments/
│  │  ├─ pipeline/            Stage، Request، StageChange، overdue.py
│  │  ├─ activities/
│  │  ├─ documents/
│  │  └─ tasks/               Task، Notification، management/commands/
│  │     كل app: models · serializers · services · views · urls · tests
│  └─ manage.py
├─ frontend/
│  └─ src/
│     ├─ api/                 schema.d.ts (مولّد) + client.ts
│     ├─ features/<module>/   pages · components · hooks
│     ├─ components/ui/       shadcn
│     └─ main.tsx / routes.tsx
└─ Makefile                   make schema · make test
```

**القاعدة بالـ backend:** `views` (HTTP بس) ← `serializers` (شكل البيانات + validation للحقول) ← `services` (قواعد الشغل + transactions) ← `models`.

---

## 3. نموذج البيانات

```python
# core/models.py
class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta: abstract = True

class Archivable(models.Model):
    archived_at = models.DateTimeField(null=True, blank=True)
    class Meta: abstract = True
    # QuerySet.active() / .archived()

# core/text.py
def normalize_ar(s): ...   # أ/إ/آ→ا، ة→ه، ى→ي، بلا تشكيل، lower
```

```python
class Client(TimeStamped, Archivable):
    name            = models.CharField(max_length=200)
    phone           = models.CharField(max_length=30, unique=True, null=True, blank=True)
    whatsapp        = models.CharField(max_length=30, blank=True)
    email           = models.EmailField(blank=True)
    city            = models.CharField(max_length=100, blank=True)
    source          = models.CharField(max_length=50, blank=True)
    tags            = ArrayField(models.CharField(max_length=40), default=list, blank=True)
    notes           = models.TextField(blank=True)
    last_contact_at = models.DateTimeField(null=True, blank=True)
    search_text     = models.TextField(editable=False, default="")   # normalize_ar(name + phone + city)

class Apartment(TimeStamped, Archivable):
    client   = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="apartments")
    title    = models.CharField(max_length=200)
    address  = models.CharField(max_length=300, blank=True)
    floor    = models.CharField(max_length=20, blank=True)
    area_m2  = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    rooms    = models.PositiveSmallIntegerField(null=True, blank=True)
    notes    = models.TextField(blank=True)

class Stage(models.Model):
    name               = models.CharField(max_length=80)
    color              = models.CharField(max_length=7, default="#64748b")
    order              = models.PositiveSmallIntegerField()
    sla_days           = models.PositiveSmallIntegerField(null=True, blank=True)
    requires_follow_up = models.BooleanField(default=False)
    closes_as          = models.CharField(max_length=4, choices=[("WON", "تم"), ("LOST", "ملغي")], blank=True)
    is_active          = models.BooleanField(default=True)   # المرحلة المستعملة ما بتنحذف (StageChange بيأشّر عليها)، بتنخفى بس
    class Meta: ordering = ["order"]

class Request(TimeStamped, Archivable):
    class Status(models.TextChoices):   OPEN = "OPEN"; WON = "WON"; LOST = "LOST"
    class Priority(models.TextChoices): LOW = "LOW"; NORMAL = "NORMAL"; HIGH = "HIGH"

    client            = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="requests")
    apartment         = models.ForeignKey(Apartment, on_delete=models.PROTECT, null=True, blank=True)
    title             = models.CharField(max_length=200)
    description       = models.TextField(blank=True)
    budget            = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    priority          = models.CharField(max_length=6, choices=Priority, default=Priority.NORMAL)
    status            = models.CharField(max_length=4, choices=Status, default=Status.OPEN)
    stage             = models.ForeignKey(Stage, on_delete=models.PROTECT)
    stage_entered_at  = models.DateTimeField(default=timezone.now)
    next_follow_up_at = models.DateTimeField(null=True, blank=True)
    last_contact_at   = models.DateTimeField(null=True, blank=True)
    assignee          = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

class StageChange(models.Model):               # سجل المراحل (للـ timeline وتقارير المدة)
    request    = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="stage_changes")
    from_stage = models.ForeignKey(Stage, on_delete=models.PROTECT, null=True, related_name="+")
    to_stage   = models.ForeignKey(Stage, on_delete=models.PROTECT, related_name="+")
    by         = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    at         = models.DateTimeField(auto_now_add=True)

class Activity(models.Model):
    class Type(models.TextChoices):
        CALL = "CALL"; WHATSAPP = "WHATSAPP"; VISIT = "VISIT"; NOTE = "NOTE"
    type     = models.CharField(max_length=10, choices=Type)
    body     = models.TextField(blank=True)
    client   = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="activities")
    request  = models.ForeignKey(Request, on_delete=models.CASCADE, null=True, blank=True)
    by       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    at       = models.DateTimeField(default=timezone.now)

class Document(TimeStamped, Archivable):
    class Category(models.TextChoices):
        CONTRACT = "CONTRACT"; QUOTE = "QUOTE"; PLAN = "PLAN"; INVOICE = "INVOICE"; PHOTO = "PHOTO"; OTHER = "OTHER"
    file          = models.FileField(upload_to=document_path)    # documents/<client>/<uuid>.<ext>
    original_name = models.CharField(max_length=255)
    size_bytes    = models.PositiveIntegerField()
    category      = models.CharField(max_length=8, choices=Category, default=Category.OTHER)
    client        = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="documents")
    apartment     = models.ForeignKey(Apartment, on_delete=models.PROTECT, null=True, blank=True,
                                      related_name="documents")
    request       = models.ForeignKey(Request, on_delete=models.SET_NULL, null=True, blank=True)
    uploaded_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

class Task(TimeStamped):
    title    = models.CharField(max_length=200)
    due_at   = models.DateTimeField()
    done_at  = models.DateTimeField(null=True, blank=True)
    client   = models.ForeignKey(Client, on_delete=models.CASCADE, null=True, blank=True)
    request  = models.ForeignKey(Request, on_delete=models.CASCADE, null=True, blank=True)
    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

class Notification(models.Model):
    class Kind(models.TextChoices):
        REQUEST_OVERDUE = "REQUEST_OVERDUE"   # واحد لكل طلب باليوم. الأسباب بتنقرا live من الطلب
        TASK_DUE        = "TASK_DUE"
        TASK_ASSIGNED   = "TASK_ASSIGNED"
    user    = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    kind    = models.CharField(max_length=15, choices=Kind)
    request = models.ForeignKey(Request, on_delete=models.CASCADE, null=True, blank=True)
    task    = models.ForeignKey(Task, on_delete=models.CASCADE, null=True, blank=True)
    day     = models.DateField()
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)   # بيعرّف الإشعارات الجديدة ليطلع إلها SSE event
    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["user", "kind", "request", "task", "day"],
            nulls_distinct=False, name="one_notification_per_day")]
```

**ملاحظات:**
- تغيير المرحلة **ما بينسجل كـ Activity**. الـ timeline بيدمج `Activity` و `StageChange` وقت العرض، وهيك ما في بيانات مكررة.
- الـ `message` تبع الإشعار ما بينخزّن. بيتولّد بالـ serializer من `kind` والطلب.
- `nulls_distinct=False` بدها **PostgreSQL 15+**.
- **الهاتف:** بينطبّع قبل الحفظ (أرقام بس، و`""` بيصير `NULL`). بدون هالخطوة، الـ `unique` بيفشل على الأرقام الفاضية، و "0991 234" و "0991234" بيمرقوا كعميلين.
- **تناسق العلاقات:** شقة الطلب لازم تكون لنفس العميل، والملف المرفوع لشقة أو طلب لازم يكون لنفس العميل. الـ `client` تبع الملف **بيشتقّه السيرفر** من الشقة أو الطلب، وما بيتبعت من الفرونت. والـ `client` تبع الطلب ما بيتغيّر بعد الإنشاء.
- 9 جداول بس، وكل واحد إلو سبب.

---

## 4. طبقة الـ services (قواعد الشغل)

كل عملية فيها أكتر من خطوة بتنكتب بـ `services.py` جوّا `transaction.atomic`. الـ API والـ Admin والـ commands بيستدعوا نفس الـ function.

**قواعد الطبقة:**
- الـ services **ما بتعرف DRF**. بترمي `django.core.exceptions.ValidationError` (بشكل dict)، والـ exception handler بيحوّلها لـ 400 بالشكل الموحّد.
- كل service بيغيّر شي بيستدعي `publish()` (القسم 6.1) **جوّا نفس الـ transaction**.

```python
# pipeline/services.py
@transaction.atomic
def change_stage(req: Request, to: Stage, *, by, follow_up_at=None) -> Request:
    req = Request.objects.select_for_update().get(pk=req.pk)
    if req.stage_id == to.id:
        return req
    if to.requires_follow_up and not (follow_up_at or req.next_follow_up_at):
        raise ValidationError({"next_follow_up_at": ["حدد موعد المتابعة لهالمرحلة"]})
    StageChange.objects.create(request=req, from_stage=req.stage, to_stage=to, by=by)
    req.stage, req.stage_entered_at = to, timezone.now()
    req.status = to.closes_as or Request.Status.OPEN
    if follow_up_at:
        req.next_follow_up_at = follow_up_at
    req.save()
    publish("request.changed", id=req.pk)
    return req

@transaction.atomic
def archive_client(client: Client, *, by) -> None:
    """أرشفة العميل بتأرشف طلباته المفتوحة كمان، وإلا بيضلّوا يطلعوا متأخرين."""
    now = timezone.now()
    Client.objects.filter(pk=client.pk).update(archived_at=now)
    Request.objects.filter(client=client, archived_at__isnull=True).update(archived_at=now)
    publish("request.changed", client_id=client.pk)

# activities/services.py
@transaction.atomic
def log_activity(*, client, type, body="", request=None, by) -> Activity:
    act = Activity.objects.create(client=client, type=type, body=body, request=request, by=by)
    if type != Activity.Type.NOTE:                       # أي تواصل حقيقي
        Client.objects.filter(pk=client.pk).update(last_contact_at=act.at)
        if request:
            Request.objects.filter(pk=request.pk).update(last_contact_at=act.at)
    publish("activity.created", client_id=client.pk, request_id=request and request.pk)
    return act
```

```python
# pipeline/overdue.py: المصدر الوحيد، مكتوب مرة وحدة بـ SQL
def with_overdue(qs, now=None):
    """بيضيف r_followup و r_sla و r_no_contact و is_overdue على كل طلب.
    منه بينبنى الفلتر (?overdue=true)، والحقول بالـ serializer، والترتيب بالـ Kanban،
    والـ scan_overdue. ما في نسخة Python تانية ممكن تختلف عنه."""
    now = now or timezone.now()
    stale = now - timedelta(days=settings.NO_CONTACT_DAYS)
    is_open = Q(status="OPEN", archived_at__isnull=True, client__archived_at__isnull=True)
    sla_interval = Func(F("stage__sla_days"), template="make_interval(days => %(expressions)s)",
                        output_field=DurationField())          # NULL إذا المرحلة بلا SLA
    qs = qs.annotate(
        sla_deadline=ExpressionWrapper(F("stage_entered_at") + sla_interval, output_field=DateTimeField()),
        contact_ref=Coalesce("last_contact_at", "created_at"),
    )
    flag = lambda cond: ExpressionWrapper(is_open & cond, output_field=BooleanField())
    return qs.annotate(
        r_followup=flag(Q(next_follow_up_at__lt=now)),
        r_sla=flag(Q(sla_deadline__lt=now)),
        r_no_contact=flag(Q(contact_ref__lt=stale)),
    ).annotate(
        is_overdue=ExpressionWrapper(Q(r_followup=True) | Q(r_sla=True) | Q(r_no_contact=True),
                                     output_field=BooleanField()),
    )
    # tests: حالة لكل سبب، وحالة بدون ولا سبب، وطلب مسكّر، وطلب عميل مؤرشف.

REASONS = {"r_followup": "FOLLOWUP_DUE", "r_sla": "STAGE_SLA", "r_no_contact": "NO_CONTACT"}
```

---

## 5. الـ Jobs: بسيطة بس صح

### شو تعلمنا من أكبر مشاريع الـ CRM على GitHub
| المشروع | طريقتهم |
|---|---|
| **Twenty** (~60k ⭐) | BullMQ + Redis، و worker process منفصل |
| **Frappe CRM / ERPNext** | RQ + Redis. الـ scheduler بيعرّف `hourly/daily/cron` بـ `hooks.py` |
| **BottleCRM** (Django + DRF) | Celery + Redis + beat. فحص SLA كل 5 دقائق، و claim بـ UPDATE مشروط ليمنع التذكير المكرر |
| **django-crm** | thread جوّا الـ web process (**نمط غلط**: بيتكرر مع كل gunicorn worker) |

هدول بيبعتوا آلاف الإيميلات و webhooks، فالـ queue عندهم ضروري. **إحنا عنا 2 jobs دوريات بس.** المبادئ الصح منحتفظ فيها، والبنية التحتية ما منحتاجها:

| المبدأ | التطبيق عنا |
|---|---|
| الـ job ما بيشتغل جوّا الـ web process | management command منفصل |
| **Idempotent** | إذا انطلق مرتين ما بيصير شي مكرر (الـ UniqueConstraint + `ignore_conflicts`) |
| **State-based مش time-based** | الـ command بيفحص **الحالة الحالية**، فإذا فات run، اللي بعده بيلقط كل شي |
| ما في تداخل | `pg_try_advisory_lock`: إذا في نسخة شغالة، التانية بتطلع فوراً (helper صغير بـ `core/locks.py`) |
| الـ context بينبعت صريح | ما في اعتماد على request أو user |

```python
# tasks/management/commands/scan_overdue.py   ← كل 5 دقائق
class Command(BaseCommand):
    def handle(self, *args, **opts):
        with advisory_lock("scan_overdue") as got:
            if not got:
                return
            now, today = timezone.now(), timezone.localdate()     # اليوم بتوقيتكم، مش UTC
            overdue = with_overdue(Request.objects.all(), now).filter(is_overdue=True)
            rows = [
                Notification(user=u, kind=Notification.Kind.REQUEST_OVERDUE, request=req, day=today)
                for req in overdue.select_related("assignee")
                for u in recipients(req)                       # المسند إلو، وإلا الـ ADMINs
            ] + [
                Notification(user=t.assignee, kind=Notification.Kind.TASK_DUE, task=t, day=today)
                for t in Task.objects.filter(done_at__isnull=True, due_at__lte=now, assignee__isnull=False)
            ]
            # إشعار واحد لكل طلب متأخر باليوم، مش واحد لكل سبب. والتذكير بيتكرر كل يوم لحتى ينحل
            Notification.objects.bulk_create(rows, ignore_conflicts=True)
            # ignore_conflicts ما بيرجّع شو انضاف فعلاً، فمنسأل حسب created_at
            for uid in (Notification.objects.filter(created_at__gte=now)
                        .values_list("user_id", flat=True).distinct()):
                publish("notification.created", user_id=uid)       # ← SSE (القسم 6.1)
```

```python
# tasks/management/commands/cleanup.py   ← مرة باليوم
# بيحذف الإشعارات المقروءة الأقدم من 90 يوم
```

```
*/5 * * * *   manage.py scan_overdue
30 2 * * *    manage.py cleanup
```
(الجدولة نفسها cron أو systemd timer، عليك.)

**متى بنضيف queue حقيقي؟** لما بدنا نبعت واتساب/إيميل. وقتها بيدخل **Procrastinate**: queue على Postgres، و worker واحد، و retries. الـ services ما بتتغيّر، بس منضيف `send_notification.defer(id)` بعد إنشاء الإشعار.

---

## 6. تصميم الـ API

### المبادئ
1. **Resources أسماء جمع، و flat.** العلاقات بتنعمل بالـ filters، ما في nesting عميق: `/requests/?client=12` مش `/clients/12/requests/`.
2. **التغيير بيكون بـ `PATCH` على الـ resource نفسه** وقت ما بيكون ممكن. ما في endpoint لكل فعل:
   - نقل مرحلة: `PATCH /requests/42/ {"stage": 5}` (الـ serializer بيمرّر لـ `change_stage`)
   - تأجيل: `PATCH /requests/42/ {"next_follow_up_at": "..."}`
   - أرشفة: `PATCH /clients/7/ {"is_archived": true}`
   - إنهاء مهمة: `PATCH /tasks/3/ {"is_done": true}`
   - قراءة إشعار: `PATCH /notifications/9/ {"is_read": true}`
3. **"تواصلت مع العميل" = إنشاء Activity:** `POST /activities/ {"type": "CALL", "client": 7, "request": 42}`. هيك ما في endpoint `contacted`.
4. **قراءة غنية وكتابة بالـ ids:** الـ response فيه ملخص صغير للعلاقات (`client: {id, name}`)، والـ request بياخد `client: 7`.
5. **حقول محسوبة read-only:** `is_overdue` و `overdue_reasons` و `days_in_stage`.
6. **أشكال ثابتة:** JSON بـ `snake_case`، والتواريخ ISO-8601 بـ UTC، والـ ids integers، والـ pagination بشكل واحد، والأخطاء بشكل واحد.

### الـ Endpoints (`/api/v1/`)

```
auth/csrf/            GET      بيزرع csrftoken
auth/login/           POST     {username, password}
auth/logout/          POST
auth/me/              GET

clients/              GET POST         ?search= &tag= &archived= &overdue=
clients/{id}/         GET PATCH
apartments/           GET POST         ?client= &search=
apartments/{id}/      GET PATCH
stages/               GET POST         (الكتابة: ADMIN)
stages/{id}/          PATCH DELETE     (DELETE بس لمرحلة ما انستعملت أبداً، وإلا 409 → `is_active=false`)
requests/             GET POST         ?client= &stage= &status= &assignee=me &overdue=
requests/{id}/        GET PATCH
activities/           GET POST         ?client= &request=
timeline/             GET              ?client= | ?request=   (Activity + StageChange + Documents مرتبين)
documents/            GET POST         ?client= &apartment= &request= &category=    (POST = multipart)
documents/{id}/       GET PATCH
documents/{id}/file/  GET              (الملف نفسه، بعد فحص الصلاحية)
tasks/                GET POST         ?due=today|week|overdue &assignee=me &done=
tasks/{id}/           GET PATCH DELETE
notifications/        GET              ?unread=true
notifications/{id}/   PATCH
notifications/read-all/  POST          (الـ action الوحيد، لأنه bulk)
dashboard/            GET
search/               GET              ?q=
```

**ما في `DELETE`** على العملاء والشقق والطلبات والملفات. الحذف هو أرشفة عبر `PATCH`، والحذف النهائي من Django Admin بس.

**تفاصيل لازم تنتبه إلها:**
- **Pagination:** حجم الصفحة الافتراضي 25، و `?page_size=` لحد 200. الـ Kanban بيطلب `requests/?status=OPEN&page_size=200`، وبيترتب بـ `?ordering=-is_overdue,next_follow_up_at`.
- **`?overdue=true`** على `clients/` معناه "عنده طلب متأخر" (`Exists` على `with_overdue`).
- **`is_archived`** حقل بالـ serializer بس: `true` بتستدعي `archive_*` service، و `false` بترجّع (`archived_at = NULL`).
- **الـ login عليه throttle** (`ScopedRateThrottle`، مثلاً 10 بالدقيقة)، والـ endpoints التانية لأ.

### أمثلة

```http
GET /api/v1/requests/?stage=4&overdue=true

200 OK
{
  "count": 2,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 42,
      "title": "إكساء شقة المزة",
      "client":    { "id": 7, "name": "أحمد سليمان" },
      "apartment": { "id": 3, "title": "المزة - بناء 4" },
      "stage":     { "id": 4, "name": "عرض سعر", "color": "#f59e0b" },
      "status": "OPEN",
      "priority": "HIGH",
      "next_follow_up_at": "2026-11-04T09:00:00Z",
      "last_contact_at": "2026-10-29T12:10:00Z",
      "days_in_stage": 9,
      "is_overdue": true,
      "overdue_reasons": ["FOLLOWUP_DUE", "STAGE_SLA"],
      "assignee": { "id": 1, "name": "أحمد" },
      "created_at": "2026-10-20T08:00:00Z"
    }
  ]
}
```

```http
PATCH /api/v1/requests/42/
{ "stage": 5 }

400 Bad Request
{
  "type": "validation_error",
  "errors": { "next_follow_up_at": ["حدد موعد المتابعة لهالمرحلة"] }
}
```

### شكل الأخطاء (موحّد عبر custom exception handler)

| Status | `type` | متى |
|---|---|---|
| 400 | `validation_error` | `errors: {field: [msg]}`، والأخطاء العامة على `non_field_errors` |
| 401 | `not_authenticated` | الجلسة انتهت. ⚠️ DRF مع `SessionAuthentication` بيرجّع 403 افتراضياً، والـ handler بيحوّلها لـ 401 ليعرف الفرونت إنه لازم يعمل login |
| 403 | `permission_denied` | (فيها كمان فشل الـ CSRF) |
| 404 | `not_found` | |
| 409 | `conflict` | الـ handler بيحوّل `ProtectedError` لـ 409، متل حذف مرحلة مستعملة |

الـ handler بيحوّل كمان `django.core.exceptions.ValidationError` (اللي بترميه الـ services) لـ 400 بنفس الشكل.

### Serializers: واحد لكل resource مع حقول read/write واضحة

```python
class RequestSerializer(serializers.ModelSerializer):
    client    = ClientRefField()             # read: {id, name}، و write: id
    apartment = ApartmentRefField(required=False, allow_null=True)
    stage     = StageRefField()
    assignee  = UserRefField(required=False, allow_null=True)
    is_overdue      = serializers.BooleanField(read_only=True)        # من with_overdue() بالـ queryset
    overdue_reasons = serializers.SerializerMethodField()             # [REASONS[k] for k in REASONS if getattr(obj, k)]
    days_in_stage   = serializers.SerializerMethodField()

    class Meta:
        model = Request
        fields = ["id", "title", "description", "budget", "priority", "status", "client", "apartment",
                  "stage", "next_follow_up_at", "last_contact_at", "assignee", "days_in_stage",
                  "is_overdue", "overdue_reasons", "created_at", "updated_at"]
        read_only_fields = ["status", "last_contact_at", "created_at", "updated_at"]

    def validate(self, data):
        if self.instance and "client" in data and data["client"] != self.instance.client:
            raise ValidationError({"client": ["ما بينفع تغيّر عميل الطلب"]})
        client = data.get("client") or self.instance.client
        apt = data.get("apartment")
        if apt and apt.client_id != client.id:
            raise ValidationError({"apartment": ["الشقة مش لهالعميل"]})
        return data

    @transaction.atomic                                  # المرحلة وباقي الحقول بينحفظوا سوا أو ما بينحفظ شي
    def update(self, instance, data):
        stage = data.pop("stage", None)
        if stage and stage != instance.stage:
            instance = change_stage(instance, stage, by=self.context["request"].user,
                                    follow_up_at=data.pop("next_follow_up_at", None))
        instance = super().update(instance, data)
        publish("request.changed", id=instance.pk)
        return instance
```

الـ ViewSet بيرجّع دايماً `with_overdue(Request.objects.select_related(...))`، فالحقول المحسوبة جاهزة بدون N+1. وبعد `PATCH`، الـ response بيتبني من query جديد ليرجع `is_overdue` محدّث.

`status` read-only لأنه بيتحدد من المرحلة (`closes_as`). هيك ما في طريقتين متضاربتين لإغلاق الطلب.

### الصلاحيات
- `ADMIN`: كل شي، وتعديل المراحل.
- `STAFF`: كل العملاء والطلبات، وفي فلتر "تبعي" (`assignee=me`).
- منحطها بـ permission class واحد + `get_queryset` بـ base ViewSet، فإذا تغيّرت القاعدة بتتغيّر بمكان واحد.

### الملفات
- **الرفع:** multipart. منفحص الامتداد + أول bytes (`%PDF-`، أو Pillow للصور)، والحد الأعلى للحجم بالـ settings، والاسم المخزّن UUID.
- **العرض:** `documents/{id}/file/` بيفحص الجلسة، وبعدين بيرجّع `X-Accel-Redirect` لـ internal location، و nginx بيبعت الملف. `media/` ما بتنخدم مباشرة. بالتطوير (بدون nginx) بيرجّع `FileResponse` عادي، والسلوك بيتبدّل بـ setting واحد.

---

## 6.1 Realtime: SSE

### ليش SSE بالذات
- الاتجاه **من السيرفر للمتصفح بس**. التعديلات أصلاً بتروح عبر الـ REST API، فما منحتاج WebSocket.
- `EventSource` جزء من المتصفح: بيرجع يتصل لحاله إذا انقطع، وبيبعت الـ session cookie تلقائياً لأنه نفس الـ origin. يعني ما في auth إضافي.
- HTTP عادي، بيمرق من nginx و Cloudflare بدون upgrade.

### المبدأ الأهم: الـ event هو **إشارة**، مش بيانات
الـ event بيحمل **نوع + ids بس**، متل `{"event": "request.changed", "data": {"id": 42}}`. لما توصل، الفرونت بيعمل `invalidateQueries`، و TanStack Query بيجيب البيانات من الـ REST API.
- **الـ API بيضل المصدر الوحيد للحقيقة.** ما في نسختين من شكل البيانات (REST و SSE) ممكن يختلفوا.
- **ما في replay ولا event store.** بعد أي انقطاع، المتصفح بيعمل resync (بيعيد جلب كل شي)، فما بيضيع ولا تحديث.
- الـ payload صغير، وهاد مهم لأن حد `NOTIFY` هو 8KB.

### المعمارية

```
 services.py (جوّا transaction)          scan_overdue (process تاني)
          │ publish() = pg_notify                 │ publish()
          └──────────────┬────────────────────────┘
                         ▼
              Postgres  channel: crm_events     ← NOTIFY بيوصل بس بعد COMMIT
                         │  LISTEN (اتصال واحد لكل process)
          ┌──────────────┴──────────────┐
     uvicorn worker 1              uvicorn worker 2
        Hub (fan-out)                 Hub (fan-out)
      ┌────┼────┐                       │
     tab  tab  tab                     tab        ← GET /api/v1/events/  (text/event-stream)
```

**ليش Postgres `LISTEN/NOTIFY`؟**
1. **Transactional مجاناً:** `pg_notify` جوّا transaction ما بينبعت إلا بعد الـ commit، وإذا صار rollback بينلغى. ما في event عن شي ما انحفظ.
2. **بيقطع بين الـ processes:** الـ `scan_overdue` (process منفصل) وكل uvicorn worker بيوصلهم نفس الـ event. هاد اللي كنا بنحتاج Redis pub/sub مشانه.
3. **Postgres حصراً:** ما في أداة جديدة.

### الـ Events

| Event | لمين | بينطلق من | الفرونت بيعمل invalidate لـ |
|---|---|---|---|
| `notification.created` | `user_id` محدد | `scan_overdue`، و`assign_task` (إشعار `TASK_ASSIGNED` إذا المسند شخص غير اللي عمل المهمة) | `notifications` + toast |
| `request.changed` | الكل | `change_stage`، والإنشاء والتعديل، و `archive_client` | `requests`، `request/{id}`، `dashboard` |
| `activity.created` | الكل | `log_activity` | `timeline`، `requests`، `clients` (بسبب `last_contact_at`) |
| `document.created` | الكل | رفع ملف | `documents` |
| `task.changed` | الكل | إنشاء/تعديل مهمة | `tasks`، `dashboard` |
| `resync` | الكل | الـ listener رجع اتصل بالـ DB | **كل شي** |

الـ events بتنطلق **من الـ services**، مش من Django signals. هيك كل event واضح وين انبعت.

### Backend

```python
# apps/realtime/events.py
CHANNEL = "crm_events"

def publish(event: str, *, user_id: int | None = None, **data) -> None:
    """بينادى جوّا transaction الـ service. Postgres بيأجّل التسليم للـ COMMIT."""
    payload = json.dumps({"event": event, "user_id": user_id, "data": data}, default=str)
    with connection.cursor() as cur:
        cur.execute("SELECT pg_notify(%s, %s)", [CHANNEL, payload])
```

```python
# apps/realtime/hub.py: واحد لكل process
class Hub:
    def __init__(self):
        self.subscribers: set[asyncio.Queue] = set()
        self._task: asyncio.Task | None = None

    def subscribe(self) -> asyncio.Queue:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._listen())   # lazy: أول مشترك بيشغّل الـ listener
        q = asyncio.Queue(maxsize=100)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    async def _listen(self):
        while True:                                            # بيرجع يتصل لحاله إذا وقعت الـ DB
            try:
                async with await psycopg.AsyncConnection.connect(DB_DSN, autocommit=True) as conn:
                    await conn.execute(f"LISTEN {CHANNEL}")
                    self._broadcast({"event": "resync"})       # ممكن يكون فات شي وقت الانقطاع
                    async for n in conn.notifies():
                        self._broadcast(json.loads(n.payload))
            except Exception:
                logger.exception("realtime listener dropped; retrying")
                await asyncio.sleep(3)

    def _broadcast(self, msg: dict) -> None:
        for q in list(self.subscribers):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:                          # client بطيء/عالق
                self.subscribers.discard(q)                    # الـ stream بيلاحظ وبيتسكّر، والمتصفح بيرجع يتصل ويعمل resync

    def is_subscribed(self, q: asyncio.Queue) -> bool:
        return q in self.subscribers

hub = Hub()
```

```python
# apps/realtime/views.py: Django view عادي (async)، مش DRF
HEARTBEAT = 20  # ثانية. ما بيخلي nginx أو Cloudflare يسكّروا الاتصال لأنه idle

async def event_stream(request):
    user = await request.auser()
    if not user.is_authenticated:
        return HttpResponse(status=401)

    q = hub.subscribe()

    async def gen():
        try:
            yield "retry: 5000\n\n"                            # المتصفح بيرجع يتصل بعد 5 ثواني
            while hub.is_subscribed(q):                        # إذا انشال بسبب overflow، منسكّر
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=HEARTBEAT)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"                         # comment، والمتصفح بيتجاهله
                    continue
                if msg.get("user_id") not in (None, user.id):  # إشعارات شخصية لصاحبها بس
                    continue
                yield f"event: {msg['event']}\ndata: {json.dumps(msg.get('data', {}))}\n\n"
        finally:                                               # المتصفح سكّر الصفحة، فمنلغي الاشتراك
            hub.unsubscribe(q)

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"                           # nginx ما بيعمل buffer لهالـ response
    return resp

# urls: path("api/v1/events/", event_stream)
```

**ملاحظات:**
- **ASGI ضروري.** تحت WSGI، كل تاب مفتوح بيحجز worker كامل. تحت ASGI الاتصال المفتوح بيكلّف coroutine بس.
- **اتصال DB واحد لكل process للـ LISTEN،** مش واحد لكل تاب.
- الـ DRF views بتضل **sync** عادي (Django بيشغّلها بـ thread). الـ view الوحيد اللي async هو `event_stream`.
- **الاختبار:** `TransactionTestCase` بيتأكد إنه الـ event بيوصل بعد الـ commit، وما بيوصل بعد rollback.
- **EventSource مش موجود بالـ OpenAPI schema.** أسماء الـ events بتكون `TextChoices` بالـ backend، وبالفرونت union صغير بـ `realtime/events.ts`.

### Frontend

```ts
// src/realtime/useLiveEvents.ts: بينادى مرة وحدة بالـ layout
const INVALIDATE: Record<string, (d: any) => QueryKey[]> = {
  "notification.created": () => [["notifications"]],
  "request.changed":      (d) => [["requests"], ["request", d.id], ["dashboard"]],
  "activity.created":     () => [["timeline"], ["requests"], ["clients"]],
  "document.created":     () => [["documents"]],
  "task.changed":         () => [["tasks"], ["dashboard"]],
};

export function useLiveEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource("/api/v1/events/");
    let opened = false;
    const resync = () => qc.invalidateQueries();

    es.onopen = () => { if (opened) resync(); opened = true; };   // بعد أي reconnect: resync
    es.addEventListener("resync", resync);
    for (const [name, keys] of Object.entries(INVALIDATE)) {
      es.addEventListener(name, (e) => {
        keys(JSON.parse((e as MessageEvent).data)).forEach((k) => qc.invalidateQueries({ queryKey: k }));
        if (name === "notification.created") toast("إشعار جديد");
      });
    }
    return () => es.close();
  }, [qc]);
}
```

- جرس الإشعارات **ما بقى يعمل polling**. بيتحدّث لما يوصل event بس.
- إذا الـ SSE وقع كلياً، النظام بيضل شغّال: TanStack Query بيعيد الجلب لما ترجع على التاب (`refetchOnWindowFocus`).
- `invalidateQueries` بيعيد جلب الـ queries المعروضة على الشاشة بس، فالـ event ما بيعمل ضغط على الـ API.

---

## 7. الـ Frontend

| الأداة | ليش |
|---|---|
| **React 19 + Vite + TypeScript** | SPA، والـ build بيطلع ملفات static |
| **React Router** | routing |
| **TanStack Query** | cache وإعادة جلب البيانات وتحديثها بعد كل تعديل. الـ SSE events بتعمل `invalidateQueries` (القسم 6.1) |
| **openapi-fetch** + types مولّدة | الـ API client بيعتمد على الـ schema تبع Django |
| **react-hook-form** | الفورمات، وأخطاء السيرفر بتنحط على الحقول (`setError`) |
| **shadcn/ui + Tailwind** | UI مع `dir="rtl"` |
| **dnd-kit** | سحب بطاقات الـ Kanban، مع تحديث فوري بالواجهة ورجوع للمكان الأصلي إذا السيرفر رفض |
| **react-pdf** | عرض PDF، وصورة مصغّرة لأول صفحة بالمتصفح |
| **date-fns** | "منذ 3 أيام" بالعربي |

```ts
// lib/applyServerErrors.ts: بديل Zod
export function applyServerErrors(err: ApiError, setError: UseFormSetError<any>) {
  for (const [field, msgs] of Object.entries(err.errors ?? {}))
    setError(field === "non_field_errors" ? "root" : field, { message: msgs[0] });
}
```

```make
schema:
	cd backend && python manage.py spectacular --file ../frontend/src/api/schema.yml
	cd frontend && npx openapi-typescript src/api/schema.yml -o src/api/schema.d.ts
```

---

## 8. ترتيب البناء

| المرحلة | المحتوى |
|---|---|
| **1. الأساس** | Django (ASGI) + DRF + Postgres + auth (session/CSRF) + exception handler + pagination + spectacular + `publish()` (من أول يوم، لتستعمله كل الـ services). Vite + React + Router + Query + shadcn RTL + login + layout |
| **2. العملاء** | Client: API + بطاقات + إنشاء/تعديل/أرشفة + بحث |
| **3. الطلبات** | Stage seed + Request + `with_overdue` + `change_stage` + Kanban + Activity + Timeline |
| **4. الشقق والملفات** | Apartment + Document + رفع + عرض |
| **5. التذكير + Realtime** | Tasks + Notifications + `scan_overdue` + Dashboard + SSE (Hub / `event_stream` / `useLiveEvents`) |
| **لاحقاً** | واتساب/إيميل (وقتها بيدخل Procrastinate)، تقارير مدة المراحل، تصدير Excel |

## 9. لسا مفتوح
1. **طبيعة الشغل**، لنثبت المراحل الافتراضية.
2. **الطلب على شقة وحدة دائماً؟** (حالياً: شقة وحدة، اختياري)

---

## 10. نتائج التشغيل والاختبار (2026-11-06)

بنيت الـ backend كامل بـ `backend/` وشغّلته على PostgreSQL 16 حقيقي. النتيجة: **62 اختبار ناجح**، و **e2e للـ SSE على Granian** ناجح، و `ruff` نظيف، و OpenAPI schema بدون ولا warning، و `check --deploy` بدون مشاكل إلا قرارات الـ proxy.

### Bugs طلعت بالاختبار (وكانت رح توصل للـ prod)
| المشكلة | الأثر | الحل |
|---|---|---|
| `is_overdue` بيطلع `NULL` بدل `false` (منطق SQL الثلاثي: `NULL < now` = `NULL`) | الطلبات اللي ما إلها موعد متابعة كانت تطلع **أول** الـ Kanban مع `-is_overdue` | `COALESCE(..., false)` على كل سبب |
| `Meta.ordering` بيتجاهله Django مع `Count` (GROUP BY) | الـ pagination تبع العملاء بيصير ترتيبه عشوائي | `order_by` صريح |
| psycopg async بيرفض `ProactorEventLoop` تبع Windows | الـ SSE ما بيستقبل شي إذا السيرفر Windows | الـ LISTEN صار بـ **thread** مع اتصال sync، و `call_soon_threadsafe` للـ loop. بيشتغل على أي نظام وأي event loop |
| `PhoneField`: الـ unique check كان بيقارن الرقم قبل التطبيع | "0991 234" مكرر بيرجع **500** بدل 400 | التطبيع جوّا `to_internal_value` (قبل الـ validators) |

### تصحيحات من البحث (docs رسمية)
| الموضوع | قبل | بعد | المصدر |
|---|---|---|---|
| Login CSRF | DRF ما بيفحص CSRF لـ login مجهول | `@csrf_protect` على `LoginView` (مختبر: بدون token = 403) | DRF auth docs |
| 401 مقابل 403 | تحويل بالـ exception handler | `SessionAuth.authenticate_header()` بيرجّع `"Session"` (الطريقة الموثّقة، ومعها `WWW-Authenticate`) | DRF docs |
| اتصالات الـ DB تحت ASGI | — | `CONN_MAX_AGE=0` + **pool تبع Django 5.1+** (`psycopg[pool]`)، و workers × `DB_POOL_MAX` < `max_connections` | Django databases docs |
| Throttle الـ login | LocMem (لكل process) | **DatabaseCache** (مشترك، Postgres بس) + `NUM_PROXIES=1` | DRF throttling docs |
| Advisory lock | session-level | **`pg_try_advisory_xact_lock`** جوّا `atomic()`، وبينفك مع COMMIT/ROLLBACK فما بيعلق أبداً | Postgres docs |
| تنزيل الملفات | FileResponse | تحت ASGI بيقرا الملف كله بـ Python، فصار **X-Accel-Redirect** بالـ prod و FileResponse بالـ dev بس | Django docs |
| أسماء الحقول للكتابة | `client: 7` | **`client_id: 7`** للكتابة و `client: {id, name}` للقراءة، مع `COMPONENT_SPLIT_REQUEST`. هيك الـ types المولّدة دقيقة | drf-spectacular docs |

### ملاحظات لإلك (nginx / تشغيل)
- **Granian:** `granian --interface asginl --workers N config.asgi:application`. (`asginl` لأنه Django ما بيدعم ASGI lifespan.) **على Windows، Granian بيشتغل بـ worker واحد بس** (قيد عنده)، وعلى Linux عدد الـ workers طبيعي. لمشروع بحجمنا، worker واحد كافي.
- **SSE location:** `proxy_buffering off; proxy_read_timeout 1h; proxy_http_version 1.1; proxy_set_header Connection "";` والـ heartbeat كل 20 ثانية.
- **HTTP/2** على nginx أو Cloudflare، لأنه بـ HTTP/1.1 المتصفح بيسمح بـ 6 اتصالات بس للدومين، وكل تاب مفتوح بياخد واحد للـ SSE.
- **`client_max_body_size`** ≥ `MAX_UPLOAD_MB` (الافتراضي عند nginx هو 1MB).
- **`/protected-media/`** كـ `internal` location بيأشّر على `MEDIA_ROOT`.
- `manage.py createcachetable` بعد `migrate` (جدول الـ throttle).
- الـ cron: `*/5 * * * * manage.py scan_overdue` و `30 2 * * * manage.py cleanup`.
- `check --deploy` بيعطي 3 warnings بس: `SECURE_SSL_REDIRECT` و HSTS subdomains/preload. هدول بيتحددوا عندك بـ Cloudflare أو nginx.

### تطوير محلي
- PostgreSQL محلي عبر `pgserver` (pip). بنسخة Windows ناقصه ملفات المناطق الزمنية، فنسختها من حزمة `tzdata`. هاد **للتطوير بس**، وما بيأثر على الـ prod.
- `uv run pytest` بيشغّل الاختبارات، و `uv run python scripts/e2e_sse.py` بيعمل e2e للـ SSE.
