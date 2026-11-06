# نموذج البيانات الموسّع: معياري، وبسيط، ومبني على متطلبات أحمد

**المبدأ:** كلام أحمد هو **متطلبات** (شو بدو يعرف ويتابع). التصميم منقرّبه لأقرب نمط معياري موجود عند مشاريع CRM حقيقية:
- Odoo CRM و Odoo Industry (real_estate و interior_design)
- EspoCRM Real Estate
- Frappe CRM و ERPNext
- Twenty، و Krayin، و Django-CRM

**ما في أسماء محلية مزروعة بالكود.** كل قائمة جدول بيعدّله المسؤول.

---

## 1) ترجمة أفكار أحمد للمعياري

| فكرة أحمد | المشكلة | المعياري | المرجع |
|---|---|---|---|
| مصدر: "واتس 1 / 2 / 3"، "واتس م.دانا" | بيخلط **القناة** مع **الرقم** مع **الموظف** | `Source` جدول أسماء (واتساب، مكالمة، إحالة…). الموظف = `assignee`. الشخص اللي جاب العميل = `referred_by` | Odoo `utm.source` + `referred`؛ Frappe `CRM Lead Source` |
| "الاستاذ طارق" كمصدر | شخص مش قناة | المصدر = **إحالة**، و `referred_by` = M.Tarek | Odoo `referred` |
| 4 أقسام بجداول وحالات منفصلة | تكرار للمنطق، وكل قسم إله statuses خاصة | عميل واحد `Contact`، و**صفقة** `Deal` على **خط مراحل** `Pipeline` (إكساء / وساطة). الأقسام بالواجهة = فلاتر | Odoo CRM (جدول واحد + stage)؛ Krayin pipelines |
| حالة طلب الشاري: يبحث / وجد / توقف | status منفصل عن المراحل | مراحل خط الوساطة: جديد ← مؤهَّل ← معاينة ← تفاوض/عرض ← تم / خسارة | Odoo industry `real_estate`؛ Twenty `buyerStage` |
| "العميل" إلو نوع حسب القسم | العميل ما إلو نوع | العميل شخص. **نوعه بيطلع من صفقاته** (عنده طلب إكساء، أو بيبيع عقار، أو بيدوّر) | EspoCRM: contact + role بالعلاقة |
| موعد المعاينة/الاتفاق + النتيجة كأعمدة | عشر أعمدة تواريخ | **نشاط مجدول** (`Activity` إله `due_at` و `done_at` ونتيجة) | Odoo activities / calendar events؛ EspoCRM Meeting |
| "المتابعة الجاية" داخل قيد السجل | مخفي جوّا السجل | = **أقرب نشاط مجدول مفتوح** للصفقة | Pipedrive/Odoo "next activity" |
| الدراسة: تاريخ إرسال + ملاحظات + قيمة العرض | حقول على الطلب | `Quote` سجل لحاله: نسخة، حالة (مسودة / مُرسل / مقبول / مرفوض / منتهي)، مبلغ، ملف | Odoo `sale.order`؛ ERPNext Quotation؛ Invoice Ninja |
| قيمة العقد + المدفوع والمتبقي | حقول ثابتة | `Deal.contract_amount` + جدول `Payment`. المتبقي **محسوب** | معياري محاسبي |
| السعر، البيع والقبض عند الإغلاق على العقار | معلومات الإغلاق على العقار | الإغلاق على **الصفقة**: المبلغ النهائي والعمولة والشاري = الصفقة الرابحة | Odoo `estate.property.offer` + Opportunity |
| "بالدولار فقط" | بيقفل الباب | `amount` + `currency` (الافتراضي USD، و USD الوحيدة المفعّلة) | كل المشاريع (Monetary / currency field) |
| الأهمية عالية/متوسطة/منخفضة + Hot/Warm/Cold | شيئين لنفس المعنى | حقل واحد: **حرارة العميل** `temperature` (hot / warm / cold) | Frappe `lead_temperature`؛ BottleCRM `rating` |
| أسباب الخسارة | ✅ صح | جدول `LostReason` (+ `applies_to`) + ملاحظة نصية | Odoo / Frappe / DjangoCRM |
| مطابقة عقار ↔ طلب | ✅ صح | Query محسوب، وما بيتخزّن. وبينحفظ اهتمام العميل بكل عقار اقترحناه | EspoCRM `interestDegree` |
| محافظة + منطقة | ✅ صح | `Location` شجرة بمستويين (parent) | EspoCRM `RealEstateLocation` |
| قوائم ثابتة (نوع العقار، الإكساء، الملكية…) | ✅ الفكرة صح | جداول lookup بيعدّلها المسؤول | — |
| الأدوار مربوطة بالحساب | ✅ صح | Django Groups: admin / sales / engineer | — |
| ملخص الصبح، وساعات الهدوء، وكتم الأنواع | ✅ صح | `NotificationPreference` + digest | — |

---

## 2) الكيانات

```
Contact ──< ContactPhone              (عميل: كل الناس)
   │
   ├──< Deal >── Stage (pipeline)     (صفقة: طلب إكساء، أو طلب شراء/إيجار، أو بيع عقار)
   │     ├── FinishingSpec (1:1)      (تفاصيل الإكساء)
   │     ├── Demand (1:1) ──< DemandMatch >── Property   (مواصفات المطلوب + اقتراحات)
   │     ├──< Quote                   (الدراسة / عرض السعر)
   │     └──< Payment
   │
   ├──< Property (owner)              (العقارات المعروضة)
   │
   └──< Activity  (contact / deal / property)   (مكالمة، واتساب، زيارة، معاينة، مهمة، ملاحظة؛ مخطط أو منجز)

Document  (contact / deal / property)  ملفات وصور ومخططات
Lookups:  Source · LostReason · Location(tree) · PropertyType · FinishLevel · ServiceType ·
          OwnershipType · Feature · DocumentCategory · Tag
Users:    User + Group(role) · NotificationPreference
```

### Contact (العميل)
- `name` (**اختياري**؛ 267 عميل بالشيت بدون اسم، وبيبيّن رقمه بداله)
- `source` → Source، و `referred_by` → User/Contact
- `assignee` → User
- `notes`، و `tags`، و `archived_at`
- **ContactPhone:**
  - `number` بصيغة **E.164** (مكتبة `phonenumbers` من Google، المنطقة الافتراضية SY)
  - `kind` (موبايل/أرضي)، و `has_whatsapp`، و `is_primary`
  - **unique** على مستوى النظام، وهاد بيحل bug الأرقام المكررة

### Stage
- `pipeline` (finishing / brokerage)، و `name`، و `order`، و `color`
- `type` (open / won / lost)، و `rotting_days`، و `requires_next_step`
- **الإكساء** (Odoo interior_design + قرار أحمد): جديد ← إرسال كتالوج ← معاينة ← دراسة ← اتفاق وعقد ← تنفيذ ← تسليم (won) | خسارة (lost)
- **الوساطة** (Odoo real_estate + Twenty): جديد ← مؤهَّل ← معاينة/جولة ← تفاوض وعرض ← تم (won) | خسارة (lost)

### Deal (الصفقة؛ بتجمع lead و deal بجدول واحد متل Odoo)
- **التصنيف والمرحلة:**
  - `kind`: finishing / buy / rent / sell. الأخيرة يعني المالك بدو يبيع عقاره عن طريقنا.
  - `stage`، و `contact`، و `title`
- **الحرارة والمسؤولين:**
  - `temperature`، و `source`، و `referred_by`
  - `assignee`، و `engineer` (للإكساء)
- **المبالغ:**
  - `expected_amount`، و `contract_amount`، و `commission_amount`، و `currency`
- **الربط والمكان:**
  - `property` (اختياري: الشقة اللي منكسيها، أو العقار المباع)
  - `location` (منطقة)، و `address`
- **الإغلاق:**
  - `lost_reason`، و `lost_notes`، و `closed_at`
  - `expected_close`، و `handover_expected`، و `execution_started_at`
- `tags`، و `archived_at`

### FinishingSpec (لـ kind=finishing)
- `service_type` → ServiceType (إكساء كامل، تجديد، تعديل وإعادة تقسيم، أعمال جزئية)
- `target_level` → FinishLevel (اقتصادي، ديلوكس، سوبر ديلوكس)
- `current_level` → FinishLevel (عضم، كسوة قديمة…)
- `property_type`، و `area_m2`
- `budget_min`، و `budget_max`

### Demand (لـ kind=buy/rent)؛ نمط EspoCRM Request
- `property_types` (M2M)، و `locations` (M2M)
- مدى السعر: `budget_min`، و `budget_max`
- مدى المساحة: `area_min`، و `area_max`
- `rooms_min`، و `floor_min`، و `floor_max`
- `finish_levels` (M2M)، و `notes`
- **DemandMatch:** `property` و `status`
  - status: suggested / sent / viewed / rejected / interested
  - مأخوذ من EspoCRM `interestDegree`

### Property (العقار)
- **التعريف والمالك:**
  - `code` (تلقائي) و `legacy_code`
  - `owner` → Contact، و `owner_role` (مالك، وكيل، وسيط، قريب المالك)
  - `property_type`، و `listing` (sale / rent / both)
  - `status` (available / reserved / sold / rented / withdrawn)
- **المكان:** `location` (منطقة)، و `address`، و `map_url`
- **الوصف:**
  - `area_m2` و `area_note`، و `rooms`، و `bathrooms`
  - `floor` (رقم: -1 قبو، 0 أرضي) و `floors_count`
  - `features` (M2M: شرفة، تراس، حديقة…)
- **الحالة:** `building_state` (قيد الإنشاء / جديد / مستخدم)، و `finish_level`
- **السعر والعقد:**
  - `price` و `price_unit` (total / per_m2 / per_dunam)، و `rent_monthly`، و `currency`، و `negotiable`
  - `ownership_type`، و `commission_pct`
- **الإدارة:** `description`، و `assignee`، و `listed_at`، و `tags`، و `archived_at`
- **حقول حسب النوع:** متل EspoCRM `propertyTypes`، الأرض ما بتبيّنلها حقول الغرف والطابق.

### Activity (نشاط واحد بدل Task + Activity + أعمدة المواعيد)
- **النوع والمحتوى:**
  - `type`: call / whatsapp / meeting / site_visit / viewing / task / note
  - `subject`، و `notes`، و `outcome`
- **التوقيت:**
  - `due_at` (للمخطط)، و `done_at` (للمنجز)
  - نشاط سجّلته هلق = `done_at` بس
- **الأشخاص:** `assignee`، و `created_by`
- **الربط:** `contact` (إجباري)، و `deal` و `property` (اختياريين)
- **للمعاينة والجولة:** `interest` (1–5)، مأخوذة من Twenty Showing
- **الخطوة الجاية للصفقة** = أقرب نشاط مفتوح إله `due_at`.

### Quote (الدراسة)
- `deal`، و `number`، و `version`
- `status`: draft / sent / accepted / rejected / expired / cancelled
- `amount`، و `currency`، و `sent_at`، و `valid_until`
- `document` (الملف)، و `notes`

### Payment
- `deal`، و `amount`، و `currency`، و `paid_at`، و `note`
- المتبقي = `contract_amount - Σ payments` (محسوب)

---

## 2.1) منع تكرار العملاء والدمج (موافق عليه: "ما بينفتح أكتر من كرت لنفس الزبون")

نفس النمط المعروف من Odoo (Merge Contacts) و HubSpot و Frappe (Deduplicate): **تطبيع، كشف، دمج**.

### التطبيع (normalization)
- **الهاتف:**
  - كل رقم بيتحوّل لصيغة E.164 بمكتبة `phonenumbers` (المنطقة الافتراضية سوريا).
  - `0933…` و `933…` و `+963 933…` و `00963933…` كلهم بيصيروا `+963933…`.
  - الأرقام الدولية (49، 90، 971…) بتنحفظ بمفتاح بلدها.
  - الأرقام العربية الهندية بتتحوّل.
- **الاسم:** بينحفظ عمود `name_key` مطبّع، وهو اللي بنقارن عليه. الاسم الأصلي ما بيتغيّر.
  - أ / إ / آ / ٱ ← ا، و ة ← ه، و ى ← ي، و ؤ ← و، و ئ ← ي
  - بيتشال التشكيل والتطويل، والفراغات الزايدة
  - "عبد الله" = "عبدالله"، و "أبو" = "ابو"
  - الألقاب ما بتدخل بالمقارنة: م. ، د. ، المهندس، الدكتور، أستاذ، مدام، أم/أبو كبادئة اختيارية

### الكشف (3 مستويات)
| الحالة | شو بيصير |
|---|---|
| **نفس الرقم** (بعد التطبيع) | **منع**. الرقم unique بالداتابيس، والواجهة بتقول "هاد الرقم لـ فلان" وبتفتح كرته |
| **نفس الاسم المطبّع** + نفس المنطقة أو رقم ناقص خانة | **تحذير** قبل الحفظ: "ممكن يكون نفس العميل؟"، مع زر "افتح الموجود" أو "كمّل" |
| **اسم قريب** (تشابه trigram على `name_key`) | بيطلع بصفحة **"مكررات محتملة"** ليراجعها المسؤول، بدون إزعاج وقت الإدخال |

### الدمج (merge)
- بتختار الكرت الأساسي. كل شي من الكرت التاني بينتقل عليه: الأرقام، والصفقات، والعقارات، والنشاطات، والملفات.
- الحقول الفاضية بالأساسي بتتعبّى من التاني، والحقول المتعارضة بتختار بينها.
- الكرت التاني ما بينحذف: بيتأرشف ومعه `merged_into`، فأي رابط قديم بيحوّل للأساسي.
- بينضاف نشاط "دُمج مع فلان" بالسجل. كل الدمج transaction وحدة.
- **الاستيراد بيستعمل نفس الكشف:** صفين بنفس الرقم بيصيروا عميل واحد إله صفقتين.

## 3) قواعد "متأخر" (معيارية)
- **نشاط مخطط فات وقته** (Odoo/Pipedrive overdue activity)
- **صفقة مفتوحة بلا خطوة جاية** (Pipedrive "no next activity")
- **الصفقة "بايتة"**: صرلها بالمرحلة أكتر من `rotting_days` (Pipedrive rotting)

## 4) الاستيراد على هالنموذج
- **المصدر:** "واتس" و"واتس م.دانا" و"واتس دانا" بيصيروا **واتساب**. "مكالمة هاتف" بتصير **مكالمة**. "الاستاذ طارق" بيصير **إحالة** و `referred_by`=M.Tarek.
- **التوزيع:** الكل لـ Ahmad.
- **ملف العملاء:**
  - كل صف = **Deal**. اكساء = finishing. شراء/اجار = buy/rent مع Demand. بيع = sell. استفسار = finishing بمرحلة "جديد"، أو حسب السياق.
  - "بمحافظة اخرى" = lost + "خارج منطقة الخدمة" (درعا بتضل مفتوحة).
  - الملاحظات = Activity(note). المعاينة = Activity(site_visit). الدراسة = Quote(sent).
- **ملف العقارات:**
  - 57 Property، والـ 19 صف "شراء" = Deal(buy) + Demand.
  - Tag "بيانات قديمة - بحاجة تأكيد"، و `listed_at`=2025-01-01.
  - الأسعار بالليرة السورية بتروح لـ `notes`.
- **الحرارة:** Hot/Warm/Cold بتروح لـ `temperature` مباشرة.

## 4.1) مؤجَّل (طلب صاحب المشروع: "في فكرة ببالي بس مو هلق")
- وحدة السعر (للمتر / للدونم)، و"قابل للتفاوض"، ورابط الخريطة، والمحافظة.
- لحد ما نحسمهم: العقار إله `price` إجمالي بس، والمكان منطقة من قائمة (`Location` مسطّحة). الإضافة بعدين ما بتكسر شي، يعني `parent` للمحافظة وحقول السعر.

## 5) قرارات لسا بدها جواب (من استبيان أحمد)
- **شركة وحدة أو أكتر (multi-tenant):** الافتراضي **شركة وحدة**، والإضافة لاحقاً ممكنة.
- **الأقسام المستقبلية** (متابعة التنفيذ، الحسابات، المواد، الموردين، بوابة العميل): التصميم بيسمحلها بـ apps جديدة بدون ما نكسر شي.
