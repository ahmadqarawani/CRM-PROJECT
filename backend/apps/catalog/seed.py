"""Starter lists. Everything is editable from the admin area afterwards."""

SOURCES = [("واتساب", True), ("انستغرام", False), ("فيسبوك", False), ("مكالمة هاتفية", False),
           ("معارف وأصدقاء", False), ("إحالة", False), ("زيارة المكتب", False), ("أخرى", False)]
LOST_REASONS = [("السعر غالي / الميزانية قليلة", "ALL"), ("استفسر وانقطع", "ALL"), ("خارج منطقة الخدمة", "FINISHING"),
                ("خدمة لا نقدمها", "FINISHING"), ("اختار شركة أخرى", "ALL"), ("غير مهتم", "ALL"),
                ("إزالة بطلب الإدارة", "ALL"), ("مكرر", "ALL")]
PROPERTY_TYPES = [("شقة", True), ("دوبلكس", True), ("منزل عربي", True), ("منزل / فيلا", True), ("محل تجاري", False),
                  ("مكتب", True), ("معمل / مستودع", False), ("أرض", False), ("بناء كامل", True)]
FINISH_LEVELS = ["عضم", "كسوة قديمة", "كسوة عادية", "كسوة جيدة", "ديلوكس", "سوبر ديلوكس"]
SERVICE_TYPES = ["إكساء كامل (عضم)", "تجديد / إعادة إكساء", "تعديل وإعادة تقسيم", "أعمال جزئية"]
OWNERSHIP_TYPES = ["طابو أخضر", "حكم محكمة", "كاتب عدل", "طابو زراعي", "عقد بيع"]
FEATURES = ["شرفة", "تراس", "حديقة", "سطح", "قبو", "فسحة سماوية", "طاقة شمسية"]
TAGS = [("بيانات قديمة - بحاجة تأكيد", "#a15c00")]

# (pipeline, name, color, type, rotting_days)
STAGES = [
    ("FINISHING", "جديد", "#64748b", "OPEN", 2),
    ("FINISHING", "إرسال الكتالوج", "#0e7c74", "OPEN", 3),
    ("FINISHING", "معاينة", "#0a5a9c", "OPEN", 5),
    ("FINISHING", "دراسة", "#3b4fb8", "OPEN", 7),
    ("FINISHING", "اتفاق وعقد", "#7a3fb0", "OPEN", 7),
    ("FINISHING", "تنفيذ", "#c2410c", "OPEN", None),
    ("FINISHING", "تسليم", "#1f7a4d", "WON", None),
    ("FINISHING", "خسارة", "#8a94a0", "LOST", None),
    ("BROKERAGE", "جديد", "#64748b", "OPEN", 2),
    ("BROKERAGE", "مؤهَّل", "#0e7c74", "OPEN", 7),
    ("BROKERAGE", "جولات ومعاينات", "#0a5a9c", "OPEN", 10),
    ("BROKERAGE", "تفاوض وعرض", "#7a3fb0", "OPEN", 7),
    ("BROKERAGE", "تم", "#1f7a4d", "WON", None),
    ("BROKERAGE", "خسارة", "#8a94a0", "LOST", None),
]


def run(apps):
    g = apps.get_model
    for i, (n, wa) in enumerate(SOURCES):
        g("catalog", "Source").objects.get_or_create(name=n, defaults={"order": i, "opens_whatsapp": wa})
    for i, (n, a) in enumerate(LOST_REASONS):
        g("catalog", "LostReason").objects.get_or_create(name=n, defaults={"order": i, "applies_to": a})
    for i, (n, r) in enumerate(PROPERTY_TYPES):
        g("catalog", "PropertyType").objects.get_or_create(name=n, defaults={"order": i, "has_rooms": r})
    for model, names in (("FinishLevel", FINISH_LEVELS), ("ServiceType", SERVICE_TYPES),
                         ("OwnershipType", OWNERSHIP_TYPES), ("Feature", FEATURES)):
        for i, n in enumerate(names):
            g("catalog", model).objects.get_or_create(name=n, defaults={"order": i})
    for n, c in TAGS:
        g("catalog", "Tag").objects.get_or_create(name=n, defaults={"color": c})
    Stage = g("deals", "Stage")
    if not Stage.objects.exists():
        for i, (p, n, c, t, rot) in enumerate(STAGES):
            Stage.objects.create(pipeline=p, name=n, color=c, type=t, rotting_days=rot, order=i)
