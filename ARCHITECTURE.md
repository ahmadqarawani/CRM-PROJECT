# معمارية BGI CRM

هاد الملف بيوصف النظام **متل ما هو مبني هلق**. التفاصيل الدقيقة بالكود، وهون الصورة الكبيرة والقرارات وليش.

## 0. القرارات

| الموضوع | القرار |
|---|---|
| Backend | Django 6.1 + DRF + PostgreSQL (16 أو أحدث). كل التحقق (validation) بالـ backend |
| Frontend | React 19 + Vite 8 + Tailwind 4 + TanStack Query، و PWA. مكوّنات خاصة فينا (ما في shadcn) |
| الربط | نفس الـ origin (nginx قدّام الاتنين)، فالدخول بـ **Django session + CSRF**. ما في JWT |
| Types الفرونت | من OpenAPI: `drf-spectacular` ← `schema.yml` ← `openapi-typescript` |
| تشغيل Django | **ASGI على Granian**: `granian --interface asginl config.asgi:application` (`asginl` لأنه Django ما بيدعم ASGI lifespan). الـ views عادية sync، إلا الـ SSE |
| Realtime | **SSE** من Postgres `LISTEN/NOTIFY`. ما في WebSockets ولا Redis |
| Jobs | **management command** وحيد (`notify_tick`) كل 5 دقائق، idempotent. ما في worker دايم ولا Redis |
| الملفات | على الديسك (`MEDIA_ROOT`). العرض بيمرق من فحص الصلاحية، و nginx بيبعت الملف (`X-Accel-Redirect`) |
| الحزم | **pip + venv**، Python **3.12**. `requirements.txt` للتشغيل و `requirements-dev.txt` للاختبار |

**الـ processes:** `postgres` و `granian` و `notify_tick` كل 5 دقائق. بس هيك.

## 1. هيكلية الـ repo

```
backend/
  config/            settings (كلها من env أو .env)، urls، asgi
  apps/
    core/            BaseViewSet (scope + ترتيب ثابت)، pagination، error handler، الإيميل، Dashboard/Search/Timeline/Audit/Reports
    access/          الأدوار والصلاحيات (RBAC)
    accounts/        login/logout/me، كلمة السر، إدارة المستخدمين، bootstrap_team، password_link
    catalog/         القوائم يلي بيعدّلها المسؤول (مصادر، مناطق، أنواع عقار، مستويات إكساء، …)
    contacts/        العميل + أرقامه (E.164)، كشف المكرر، الدمج
    properties/      العقارات المعروضة
    deals/           الطلبات (إكساء + وساطة)، المراحل، المطابقة، الدراسات والدفعات، import_sheets
    activities/      النشاط المنجز والمخطط (مكالمة، واتساب، معاينة، مهمة…)
    documents/       الملفات المرفوعة
    notifications/   الإشعارات + notify_tick
    realtime/        SSE (hub + events)
  tests/
frontend/src/
  api/               client (openapi-fetch) + hooks (TanStack Query) + schema.d.ts (مولّد)
  components/        Shell، DealPanel، forms، bits، ui، Brand، SearchPalette
  pages/             Today، Board (كروت الطلبات)، Contacts، Properties، Archive، Settings، …
  lib/               access (الصلاحيات بالواجهة)، url (فلاتر بالـ URL)، live (SSE)، format
  index.css، themes.css   التصميم (زجاج + لكل قسم ألوانه وحوافه)
data-import/DATA_MODEL.md   نموذج البيانات المعياري وقواعد الاستيراد
```

## 2. نموذج البيانات

- **Contact:** عميل واحد لكل شخص. الاسم اختياري، فبيبيّن الرقم بداله. أرقام متعددة (`ContactPhone`) مطبّعة لـ E.164، والرقم ما بيتكرر أبداً بالنظام. فيه مصدر، ومسؤول، ووسوم. المكررات المحتملة (نفس الاسم بأرقام مختلفة) بتنعرض للمراجعة وبتندمج يدوياً.
- **Property:** المالك دايماً Contact. كود تلقائي `P-0001` (بيتبحث فيه)، والنوع، والمنطقة، والمساحة، والسعر، والحالة (متاح/محجوز/مباع)، والإضافات.
- **Deal (الطلب):** على **pipeline** من اتنين: `FINISHING` (إكساء) و `BROKERAGE` (شراء/إيجار/بيع/تأجير). المرحلة (`Stage`) إلها نوع `OPEN/WON/LOST`، والخسارة لازم يكون معها سبب.
  - `FinishingSpec`: تفاصيل الإكساء. `Demand`: مواصفات الشاري أو المستأجر. `DemandMatch`: رأيه بكل عقار مطابق.
  - `Quote`: الدراسات (بإصدارات). `Payment`: الدفعات، والباقي = قيمة العقد − المدفوع.
- **Activity:** نشاط **منجز** (`done_at`) أو **مخطط** (`due_at`) على عميل، ومعه طلب أو عقار اختياري. "الخطوة الجاية" لأي طلب هي أقرب نشاط مخطط إله.
- **Document:** ملف مربوط بعميل، ومعه طلب أو عقار أو دراسة اختياري.
- **Role / UserAccess:** كل مستخدم إله دور واحد (شوف §4).
- **Audit log** على كل الموديلات (`django-auditlog`)، وبينعرض بالعربي (أسماء بدل أرقام).
- **الأرشفة** (`archived_at`) بدل الحذف. الحذف النهائي صلاحية لحالها.

## 3. "بدها انتباه" (مكان واحد: `deals/overdue.py`)

`with_attention()` بتضيف للـ query أعلام محسوبة بالـ SQL، فالفلتر والترتيب والعدّ وصفحة اليوم كلهم بيعتمدوا على نفس التعريف:

| السبب | متى |
|---|---|
| `ACTIVITY_OVERDUE` | طلب مفتوح إله نشاط مخطط موعده فات |
| `NO_NEXT_STEP` | طلب مفتوح ما إله ولا نشاط مخطط |
| `STUCK` | صرله بالمرحلة أكتر من `rotting_days` تبعها (بيتعدّل من الإعدادات) |

## 4. الصلاحيات (RBAC)

- **التعريف كله بمكان واحد:** `access/registry.py`. فيه:
  - **صلاحيات بنطاق** (`none` / `own` / `all`): عرض وتعديل وحذف العملاء والطلبات والعقارات والنشاط والملفات.
  - **صلاحيات تشغيل/إطفاء:** إضافة، دمج، المبالغ (`finance.view` و `finance.manage`)، تقارير الفريق، سجل التعديلات، والإدارة (مستخدمين / أدوار / إعدادات / تسليم شغل).
- **"تبعه" (own):** مسؤول عنه، أو مهندسه، أو هو يلي أنشأه. للعميل كمان: إذا عنده طلب مسؤول عنه.
- **التطبيق بالسيرفر:**
  - `BaseViewSet` بيفلتر كل query حسب نطاق العرض، فيلي ما إلك تشوفه بيرجع 404.
  - `RolePermission` بيحوّل كل action لمفتاح صلاحية، وبيفحص "own" على السجل نفسه.
  - كل سجل بيرجع معه `access: {edit, delete}`، فالواجهة بتخبي الأزرار يلي ما بتنفع.
- **المبالغ (حماية على مستوى الحقل):** بتطلع `null` بدون `finance.view`، وقيمة العقد والعمولة بتتغيّر بس مع `finance.manage`.
- **5 أدوار أساسية** بتتعدّل من الإعدادات وما بتنحذف: مدير النظام، مدير مبيعات، موظف مبيعات (الافتراضي)، مهندس، مشاهد. الـ superuser بيتجاوز كلشي، وما حدا غير superuser بيقدر يعدّل حساب superuser.
- **المالك الافتراضي:** يلي بيضيف عميل أو طلب بيصير هو المسؤول.

## 5. الـ API (`/api/v1/`)

**المبادئ:**
- resources مسطّحة (`deals/?contact=7` بدل `contacts/7/deals/`).
- تغيير الحالة بـ `PATCH` (مرحلة، أرشفة).
- للكتابة `*_id`، وللقراءة كائن متداخل (`COMPONENT_SPLIT_REQUEST`)، فالـ types المولّدة دقيقة.
- كل الأخطاء بشكل واحد: `{"type": "...", "errors": {"field": ["..."]}}`.
- **الترتيب بكل list بينتهي بـ `-pk`،** فما في سجل بيتكرر أو بيضيع بين الصفحات.

| المسار | الوظيفة |
|---|---|
| `contacts/` + `check-phone/` `duplicates/` `{id}/merge/` | العملاء |
| `properties/` + `{id}/demands/` | العقارات + الطلبات المناسبة إلها |
| `deals/` + `stage-counts/` `{id}/matches/` `{id}/match/` `{id}/convert/` | الطلبات، وأعداد المراحل حسب الفلاتر، والمطابقة، والتحويل لإكساء |
| `stages/` `quotes/` `payments/` `activities/` (+ `{id}/complete/`) `documents/` (+ `{id}/file/`) | الباقي |
| `dashboard/` `search/` `timeline/` `audit/` `reports/` | قراءة مجمّعة |
| `notifications/` `notification-preferences/` | الإشعارات والكتم |
| `auth/*` | csrf، login، logout، me، password-reset (+ check/confirm)، password/change |
| `admin/users/` (+ `{id}/reset-link/`) `admin/roles/` `admin/permissions/` `admin/settings/` `admin/hand-over/` | الإدارة |
| `events/` | SSE |

## 6. Realtime (SSE)

- **الـ event هو إشارة مش بيانات:** `request.changed {id}`، و `client.changed`، و `activity.created`، و `document.created`، و `notification.created`. الواجهة بتعمل invalidate للـ query المناسب وبتجيب من الـ API (والصلاحيات بتنطبق هونيك).
- **النشر:** `publish()` بيعمل `NOTIFY` جوّا `transaction.on_commit`، فما بيطلع event لشي ما انحفظ.
- **الاستقبال:** بكل process في **اتصال LISTEN واحد بـ thread** (sync psycopg)، وبيوزّع على كل الـ streams المفتوحة بالـ process. هيك بيشتغل على Windows و Linux، وبأكتر من worker.
- **الـ stream:** `retry: 5000` بالأول، و heartbeat كل 20 ثانية، و `X-Accel-Buffering: no`.

## 7. الإشعارات و `notify_tick`

بيشتغل كل 5 دقائق، و idempotent (إشعار واحد لكل مستخدم/نوع/هدف/يوم):
- **تذكير بموعد قبل ساعة** (`ACTIVITY_DUE`)، إلا بساعات الهدوء.
- **ملخص الصبح** (`DIGEST`) بعد `digest_hour`، وبالإيميل كمان إذا الإيميل مفعّل.
- **المتأخرات مرة وحدة آخر النهار** (`ACTIVITY_OVERDUE`، الساعة 20).
- **ساعات الهدوء، والملخص، والإيميل** كلهم من `SiteSettings` (صفحة الإعدادات)، وكل مستخدم بيقدر يكتم أنواع.
- **الإيميل:** SMTP من الإعدادات (Gmail App Password). بـ Django 6.1 بننبني `EmailBackend(alias=...)` مباشرة لأنه الإعدادات بالـ DB مش بـ `MAILERS`.

## 8. الـ Frontend

- **طبقة الـ API:**
  - `openapi-fetch` مع types من الـ schema، و TanStack Query للكاش.
  - SSE بيعمل invalidate بس.
- **الصفحات:**
  - **اليوم:** المتأخر، ومواعيد اليوم، والطلبات بلا خطوة جاية.
  - **الإكساء** و **طلبات العقارات:** كروت 4 بالصف × 5 صفوف، وفلاتر بالـ URL، وعدد لكل مرحلة من السيرفر، و pagination.
  - **العملاء** و **العقارات** و **الأرشيف:** صفحات بالـ pagination.
  - **كرت العميل** و **كرت العقار** و **لوحة الطلب.**
  - **المكررات** و **الإعدادات:** المستخدمين، والأدوار، والقوائم، والمراحل، والإيميل، وتسليم الشغل.
- **التصميم:**
  - زجاج على ألوان اللوغو.
  - **كل قسم إله ثيم:**
    - الإكساء = BGI Unlocked (برتقالي، حواف مدوّرة).
    - العقارات = BGI Real Estate (كحلي، حواف حادة).
    - الباقي = اللوغوين بمربع.
  - كلها متغيّرات CSS بـ `themes.css` حسب `html[data-theme]`.
- **PWA**، والموبايل إله شريط سفلي وقائمة "المزيد". **Ctrl+K** للبحث.

## 9. التطوير والفحوصات

- **التشغيل المحلي والأوامر:** بالـ `README.md` (pip + venv، Python 3.12، Node 22 أو أحدث).
- **CI** (`.github/workflows/ci.yml`) على **Ubuntu 24.04 + Python 3.12.3** (نفس السيرفر)، و Postgres 16 و 18:
  - تنصيب الـ requirements بـ pip، و `pip check`، و ruff.
  - `check` و `check --deploy` بإعدادات الإنتاج، وفحص إنه ما في migrations ناقصة.
  - الاختبارات (والـ deprecation warnings بتعتبر أخطاء)، وإنه الـ OpenAPI schema محدّث.
  - تشغيل حقيقي على Granian: login، والـ endpoints الأساسية، والـ SSE.
  - build الفرونت على Node LTS.

## 10. دروس من الاختبار والـ docs الرسمية

| الموضوع | المشكلة | الحل |
|---|---|---|
| أعلام "بدها انتباه" | منطق SQL الثلاثي: `NULL < now` بيطلع `NULL` بدل false | `COALESCE(…, false)` على كل سبب |
| الترتيب مع `Count` | Django بيتجاهل `Meta.ordering` مع GROUP BY | `order_by` صريح، والـ `-pk` بالآخر دايماً |
| psycopg async على Windows | بيرفض `ProactorEventLoop`، فالـ SSE ما بيستقبل شي | LISTEN بـ thread مع اتصال sync و `call_soon_threadsafe` |
| رقم مكرر بصيغة تانية | الـ unique check قبل التطبيع بيرجّع 500 | التطبيع جوّا `to_internal_value` |
| Login CSRF | DRF ما بيفحص CSRF لمستخدم مجهول | `@csrf_protect` على `LoginView` |
| 401 مقابل 403 | — | `SessionAuth.authenticate_header()` |
| الـ DB تحت ASGI | — | `CONN_MAX_AGE=0` + pool تبع Django (`psycopg[pool]`)، و workers × `DB_POOL_MAX` < `max_connections` |
| throttle الـ login | LocMem منفصل لكل process | `DatabaseCache` مشترك (`createcachetable`) |
| تنزيل الملفات تحت ASGI | `FileResponse` بيقرا الملف بـ Python | `X-Accel-Redirect` بالإنتاج |
| Kanban بحد 200 | 225 طلب مفتوح، فالأعداد غلط | كروت بـ pagination من السيرفر، و `stage-counts` |
| كود العقار ما بيتبحث فيه | الكود بيتولّد بعد بناء نص البحث | إعادة بناء النص بعد توليد الكود، و migration للقديم |

## 11. ملاحظات التشغيل (إلك)

- **Granian على Linux:**
  - `granian --interface asginl --host 127.0.0.1 --port 8000 --workers N config.asgi:application`.
  - على Windows بيشتغل بـ worker واحد بس.
- **SSE ورا nginx:** `proxy_buffering off`، و `proxy_read_timeout` أطول من 20 ثانية، و `proxy_http_version 1.1`.
- **HTTP/2:** بـ HTTP/1.1 كل تاب مفتوح بياخد اتصال من الـ 6 المسموحين للدومين.
- **ملفات nginx:**
  - `client_max_body_size` ≥ `MAX_UPLOAD_MB` (25).
  - `/protected-media/` كـ `internal` بيأشّر على `MEDIA_ROOT`.
  - `/static/` بيأشّر على `staticfiles/` بعد `collectstatic`.
- **بعد `migrate`:** `createcachetable`. والمجدول: `notify_tick` كل 5 دقائق.
- **بالإنتاج:**
  - الكوكيز `Secure`، فالدخول لازم يكون عبر **HTTPS**.
  - `NUM_PROXIES` = عدد الـ proxies قدّام Django.
  - `APP_URL` للروابط بالإيميلات.
