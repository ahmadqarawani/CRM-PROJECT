"""Every permission in the system, and the default roles.

Modelled on the big CRMs: a *scope* (none / own / all) for seeing, editing and deleting records
(HubSpot "owned / all", Pipedrive visibility groups, Salesforce sharing), plain on/off switches for
everything else, and field-level protection for money (Salesforce field-level security).

"own" = assigned to me (or I'm the engineer / I created it) — see services.OWN for each resource.
"""

NONE, OWN, ALL = "none", "own", "all"
SCOPES = (NONE, OWN, ALL)
SCOPE_RANK = {NONE: 0, OWN: 1, ALL: 2}

# key -> (group, label, kind) ; kind "scope" takes none/own/all, "bool" takes true/false
PERMISSIONS: dict[str, tuple[str, str, str]] = {
    "contacts.view": ("العملاء", "عرض العملاء", "scope"),
    "contacts.create": ("العملاء", "إضافة عميل", "bool"),
    "contacts.edit": ("العملاء", "تعديل وأرشفة", "scope"),
    "contacts.delete": ("العملاء", "حذف نهائي", "scope"),
    "contacts.merge": ("العملاء", "دمج المكررات", "bool"),

    "deals.view": ("الطلبات", "عرض الطلبات", "scope"),
    "deals.create": ("الطلبات", "إضافة طلب", "bool"),
    "deals.edit": ("الطلبات", "تعديل ونقل المراحل", "scope"),
    "deals.delete": ("الطلبات", "حذف نهائي", "scope"),

    "properties.view": ("العقارات", "عرض العقارات", "scope"),
    "properties.create": ("العقارات", "إضافة عقار", "bool"),
    "properties.edit": ("العقارات", "تعديل وأرشفة", "scope"),
    "properties.delete": ("العقارات", "حذف نهائي", "scope"),

    "activities.view": ("النشاط والمواعيد", "عرض النشاط والمواعيد", "scope"),
    "activities.create": ("النشاط والمواعيد", "تسجيل تواصل وموعد", "bool"),
    "activities.edit": ("النشاط والمواعيد", "تعديل وإنجاز", "scope"),
    "activities.delete": ("النشاط والمواعيد", "حذف", "scope"),

    "documents.view": ("الملفات", "عرض الملفات", "scope"),
    "documents.upload": ("الملفات", "رفع ملفات", "bool"),
    "documents.delete": ("الملفات", "حذف وأرشفة ملفات", "scope"),

    "finance.view": ("المبالغ", "رؤية المبالغ والدراسات والدفعات", "bool"),
    "finance.manage": ("المبالغ", "إضافة دراسات ودفعات وقيمة العقد", "bool"),

    "reports.team": ("التقارير", "رؤية شغل كل الفريق والتقارير", "bool"),
    "audit.view": ("التقارير", "رؤية سجل التعديلات", "bool"),

    "admin.users": ("الإدارة", "إدارة المستخدمين", "bool"),
    "admin.roles": ("الإدارة", "إدارة الأدوار والصلاحيات", "bool"),
    "admin.settings": ("الإدارة", "الإعدادات: القوائم والمراحل والإيميل", "bool"),
    "admin.handover": ("الإدارة", "تسليم الشغل بين الموظفين", "bool"),
}

RECORDS = ("contacts", "deals", "properties", "activities")


def _full() -> dict:
    return {k: (ALL if kind == "scope" else True) for k, (_, _, kind) in PERMISSIONS.items()}


def _records(view, create, edit, delete, *, which=RECORDS) -> dict:
    out = {}
    for r in which:
        out |= {f"{r}.view": view, f"{r}.create": create, f"{r}.edit": edit, f"{r}.delete": delete}
    return out


DEFAULT_ROLES: dict[str, dict] = {
    "admin": {
        "name": "مدير النظام", "order": 0,
        "description": "كل شي، مع إدارة المستخدمين والأدوار والإعدادات.",
        "permissions": _full(),
    },
    "manager": {
        "name": "مدير مبيعات", "order": 1,
        "description": "كل البيانات والحذف والدمج وتسليم الشغل والتقارير والمبالغ — بدون إعدادات النظام.",
        "permissions": _full() | {"admin.users": False, "admin.roles": False, "admin.settings": False},
    },
    "agent": {
        "name": "موظف مبيعات", "order": 2,
        "description": "بيشوف كل شي، بيعدّل شغله بس، ما بيحذف وما بيدمج.",
        "permissions": _records(ALL, True, OWN, NONE) | {
            "activities.delete": OWN, "contacts.merge": False,
            "documents.view": ALL, "documents.upload": True, "documents.delete": OWN,
            "finance.view": True, "finance.manage": False, "reports.team": False, "audit.view": True,
        },
    },
    "engineer": {
        "name": "مهندس", "order": 3,
        "description": "طلبات الإكساء يلي هو مسؤول عنها أو مهندسها، مع الدراسات والدفعات.",
        "permissions": _records(ALL, False, NONE, NONE, which=("contacts", "properties")) | {
            "deals.view": OWN, "deals.create": False, "deals.edit": OWN, "deals.delete": NONE,
            "activities.view": OWN, "activities.create": True, "activities.edit": OWN, "activities.delete": OWN,
            "contacts.merge": False, "documents.view": ALL, "documents.upload": True, "documents.delete": OWN,
            "finance.view": True, "finance.manage": True, "reports.team": False, "audit.view": True,
        },
    },
    "viewer": {
        "name": "مشاهد فقط", "order": 4,
        "description": "بيشوف بدون ما يعدّل شي، وبدون المبالغ.",
        "permissions": _records(ALL, False, NONE, NONE) | {"documents.view": ALL},
    },
}
DEFAULT_ROLE = "agent"  # what a new user gets unless the admin picks another


def normalize(perms: dict | None) -> dict:
    """Fill in every key (missing = no access) and drop unknown ones / bad values."""
    perms = perms or {}
    out = {}
    for key, (_, _, kind) in PERMISSIONS.items():
        v = perms.get(key)
        out[key] = (v if v in SCOPES else NONE) if kind == "scope" else bool(v)
    return out
