# بحث التصميم: واجهات CRM هادئة ومرتبة

**الهدف:** واجهة هادئة ومرتبة لـ **BGI Real Estate**. بدون template الـ AI المعروف (shadcn الافتراضي، Untitled UI، gradients بنفسجية، glassmorphism، أيقونات ✨، دوائر KPI ضخمة).
**المصادر:** Dribbble، ومواقع منتجات CRM حقيقية. تصفحتهم بـ Chrome بتاريخ 2026-11-06.

---

## A. منتجات CRM حقيقية (11)

| # | الواجهة | الرابط | شو المنيح فيها | شو منستعير |
|---|---|---|---|---|
| 1 | **Attio** | https://attio.com | أبيض وأسود تقريباً، حدود 1px، sidebar بأيقونات رفيعة | الهدوء العام وقائمة "Records" بالـ sidebar |
| 2 | **folk** | https://www.folk.app | Kanban فيه pills بألوان باهتة لكل مرحلة، و**ذيل البطاقة بيبيّن الخطوة الجاية: "Overdue" بنقطة حمرا أو "Today" بنقطة صفرا** | **ذيل بطاقة الطلب** (`next_follow_up_at` + الحالة) |
| 3 | **Twenty** | https://twenty.com | جدول كثيف، صفوف رفيعة، ولون واحد بس للزر الأساسي | **جدول العملاء**، والفلتر والترتيب كنص بدل أزرار ملوّنة |
| 4 | **Close** | https://www.close.com | صفحة العميل بعمودين: معلومات وجهات اتصال على اليسار، و**timeline** على اليمين | **تخطيط صفحة العميل والطلب** |
| 5 | **Relate** | https://www.relate.so | رأس عمود الـ pipeline فيه نقطة لون + اسم + عدد + مجموع المبلغ | **رأس أعمدة الـ Kanban** |
| 6 | **Clarify** | https://www.clarify.ai | صفحة **"Your day"**: تاريخ اليوم، وجملة وحدة، وقائمة | **صفحة "اليوم"** بدل dashboard مليان charts |
| 7 | **Breakcold** | https://www.breakcold.com | عمود **"Last interaction"** كشريط صغير من الأخضر للأحمر | **مؤشر "آخر تواصل"** (`last_contact_at` / NO_CONTACT) |
| 8 | **Less Annoying CRM** | https://www.lessannoyingcrm.com | معمول للشركات الصغيرة. **رمادي-أزرق مع accent برتقالي** (قريب كتير من ألوان BGI)، وعناصر مجمّعة: "Upcoming Task" و "Lead" | **قسم "مرفقات وخطوات" بصفحة العميل**، وتوزيع الألوان |
| 9 | **Day.ai** | https://day.ai | خلفية off-white، و **monospace للبيانات الوصفية**، وأزرق واحد | استعمال **خط mono للأرقام والتواريخ** |
| 10 | **Monica** | https://www.monicahq.com | رمادي بالكامل، labels صغيرة بخط mono | الهدوء ومساحات بيضا كبيرة |
| 11 | **Capsule** | https://capsulecrm.com | خلفية دافية off-white، وبطاقات معلومات بسيطة | خلفية **مش أبيض صافي** |

## B. تصاميم Dribbble هادئة (CRM عام) (7)

| # | التصميم | الرابط | ليش اخترته |
|---|---|---|---|
| 12 | Support Tickets Kanban — Diana Larussa | https://dribbble.com/shots/27446925 | Kanban فاتح، بطاقات نصية، ألوان بالـ tags بس |
| 13 | CRM Team Workflow — Shakuro | https://dribbble.com/shots/27258882 | رمادي محايد، جدول نظيف، ولون أخضر بس للحالة |
| 14 | PropTech CRM Deal Flow — Nuvelabs | https://dribbble.com/shots/27332795 | **عقارات**، جدول بصفوف واضحة، و pagination بسيط |
| 15 | Setting — Azmir Sheikh | https://dribbble.com/shots/26935070 | صفحة إعدادات بفورمات مرتبة بعمودين |
| 16 | Crisply Account Settings — Illiyin Studio | https://dribbble.com/shots/25800159 | sidebar رمادي فاتح وتسلسل واضح للعناوين |
| 17 | Crisply Side Bar — Illiyin Studio | https://dribbble.com/shots/25794911 | sidebar بمجموعات وعدّاد صغير |
| 18 | Saibord CRM — ideapeel | https://dribbble.com/shots/25919222 | dashboard فاتح، chart خطي وحيد، بدون زحمة |

## C. تصاميم Dribbble لـ CRM عقاري (7)

| # | التصميم | الرابط | ليش اخترته |
|---|---|---|---|
| 19 | Real Estate CRM Web — Conceptzilla | https://dribbble.com/shots/27123683 | Kanban بصور مصغّرة للعقار، فاتح جداً |
| 20 | Real Estate CRM Dashboard — Conceptzilla | https://dribbble.com/shots/27006273 | نفس الأسلوب، وصور الشقق داخل البطاقات |
| 21 | AIRES Real Estate CRM — Phenomenon | https://dribbble.com/shots/25860935 | **عرض مخطط الشقة (floor plan) جوّا الصفقة**، رمادي هادئ |
| 22 | Buyer Profile Pipeline — Nasim | https://dribbble.com/shots/27643736 | صفحة عميل فيها "Today, 9:30 AM" وقائمة خطوات، off-white مع أخضر غامق |
| 23 | Brickline Dashboard — Nasim | https://dribbble.com/shots/27642297 | جملة ملخص اليوم ("3 showings, 2 closings")، و chart واحد |
| 24 | Landify Properties View — Nasim | https://dribbble.com/shots/27456725 | grid بطاقات شقق بصور، فاتح ومرتب |
| 25 | Property Sales Dashboard — Nixtio | https://dribbble.com/shots/27685134 | صور العقار **رمادية (monochrome)** والأرقام بخط كبير، أسلوب editorial |

**استبعدت عن قصد:** Untitled UI CRM (template منتشر جداً)، وأي تصميم بنفسجي/gradient/glass، والـ dashboards الداكنة بألوان neon، والـ dashboards المليانة donut و KPI.

---

## المبادئ المشتركة (اللي بيخلّي الواجهة هادية)

1. **اللون معناه معلومة، مش زينة.** معظم الشاشة محايد. اللون بيطلع بس للحالة (متأخر، اليوم، المرحلة) وللزر الأساسي.
2. **حدود 1px بدل الظلال.** الظل بس للعناصر الطايرة (dropdown، dialog).
3. **خلفية مش أبيض صافي.** الصفحة رمادي فاتح كتير، والبطاقات أبيض. هيك بيطلع العمق بدون ظلال.
4. **كثافة معتدلة:** صفوف الجداول 40px، والبطاقات فيها 3-4 أسطر بس.
5. **خط واحد** بأوزان 400 و 500 و 600، والأرقام والتواريخ بخط mono أو tabular.
6. **الصفحة الرئيسية "اليوم":** جملة، وبعدين قوائم (متأخرين، مواعيد). بدون charts بالبداية.
7. **الخطوة الجاية ظاهرة دايماً** على البطاقة (folk)، وهاد بالضبط اللي بيحل "مين متأخر عن الرد".

### ربط مباشر بالنظام تبعنا

| مكان بنظامنا | النمط المستعار |
|---|---|
| بطاقة الطلب بالـ Kanban | folk: ذيل فيه نقطة + "متأخر" / "اليوم" + نص الخطوة الجاية |
| رأس عمود المرحلة | Relate: نقطة لون المرحلة · الاسم · العدد |
| جدول العملاء | Twenty: صف رفيع + Breakcold: شريط "آخر تواصل" |
| صفحة العميل | Close: معلومات يمين (RTL) و timeline يسار + LACRM: "خطوات جاية" مجمّعة |
| صفحة الشقة | Landify: صورة وبطاقة + AIRES: معاينة المخطط والـ PDF جوّا الصفحة |
| الصفحة الرئيسية | Clarify / Brickline: "الخميس 6 تشرين الثاني · عندك 4 متابعات متأخرة" وقائمة |

---

## لوحة الألوان (مشتقة من لوغو BGI)

> القيم تقريبية من صورة اللوغو. إذا عندكم الـ hex الرسمي من brand guide، منبدّلهم.

| الدور | اللون | الاستعمال |
|---|---|---|
| **Ink** (نص أساسي) | `#13263A` | النصوص والعناوين، مشتق من الكحلي تبع "BGI" |
| **Navy** | `#0B2E4A` | الـ sidebar النشط والعناوين الكبيرة |
| **Primary** (أزرق BGI) | `#0A5A9C` | الزر الأساسي، الروابط، والـ focus |
| **Accent** (برتقالي BGI) | `#F26B1D` | **"انتباه": متأخر أو اليوم**، باعتدال كتير |
| **Mint** | `#7CC9BC` | نجاح أو "تم"، كـ tint خفيف |
| **Cyan** | `#12B5CB` | معلومات، نادراً |
| Danger | `#C8432F` | حذف أو خطأ بس، مش للتأخير |
| Background | `#F5F6F8` | خلفية الصفحة (رمادي مايل للكحلي) |
| Surface | `#FFFFFF` | البطاقات والجداول |
| Border | `#E3E7EC` | كل الحدود |
| Muted text | `#5E6E7E` | النصوص الثانوية |

**ألوان المراحل** (tints خفيفة، النص بلون أغمق من نفس العيلة):
طلب جديد `#EEF1F4` · تواصل `#E6F0F8` · معاينة `#E8F4F2` · عرض سعر `#FDF0E7` · بانتظار الرد `#FBE7DA` · عقد `#E4ECF5` · تنفيذ `#E6F4F1` · تسليم `#E3F3EE` · تم `#DDF1EC` · ملغي `#F3E6E4`

**الخطوط:** IBM Plex Sans Arabic (عربي + لاتيني متناسقين)، و IBM Plex Mono للأرقام والتواريخ ورقم الطلب.

**قواعد:**
- البرتقالي ما بيكون لون زر عادي. هو إشارة "انتبه"، وإذا كتر بيفقد معناه.
- ما في gradients ولا glass ولا ظلال كبيرة. الـ radius 8px للبطاقات و 6px للأزرار.
- اللوغو (الدوائر التلاتة) بيظهر بالـ sidebar وبشاشة الدخول بس.
