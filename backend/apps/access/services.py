"""can(user, "deals.edit", obj) and scoped(qs, user, "deals") — the two questions every endpoint asks."""

from django.db.models import Q

from .registry import ALL, DEFAULT_ROLE, NONE, OWN, PERMISSIONS, normalize

_FULL = {k: (ALL if kind == "scope" else True) for k, (_, _, kind) in PERMISSIONS.items()}


def role_of(user):
    from .models import Role, UserAccess

    try:
        return user.access.role
    except UserAccess.DoesNotExist:
        return Role.objects.filter(slug=DEFAULT_ROLE).first()


def perms_for(user) -> dict:
    """The user's effective permissions (cached on the user object for the request)."""
    if not getattr(user, "is_authenticated", False) or not user.is_active:
        return normalize({})
    if user.is_superuser:
        return dict(_FULL)
    cached = getattr(user, "_perms_cache", None)
    if cached is None:
        role = role_of(user)
        cached = normalize(role.permissions if role else {})
        user._perms_cache = cached
    return cached


def scope(user, key: str) -> str:
    v = perms_for(user).get(key, NONE)
    return v if isinstance(v, str) else (ALL if v else NONE)


def has(user, key: str) -> bool:
    """On/off permission, or a scope that is not "none"."""
    v = perms_for(user).get(key)
    return v not in (None, False, NONE)


# what "own" means for each kind of record
def own_q(resource: str, user) -> Q:
    from apps.deals.models import Deal

    mine_deals = Q(assignee=user) | Q(engineer=user)
    return {
        "contacts": Q(assignee=user) | Q(pk__in=Deal.objects.filter(mine_deals).values("contact_id")),
        "deals": mine_deals,
        "properties": Q(assignee=user) | Q(owner__assignee=user),
        "activities": Q(assignee=user) | Q(created_by=user),
        "documents": Q(uploaded_by=user) | Q(deal__assignee=user) | Q(deal__engineer=user) | Q(contact__assignee=user)
                     | Q(property__assignee=user),
        "quotes": Q(deal__assignee=user) | Q(deal__engineer=user),
        "payments": Q(deal__assignee=user) | Q(deal__engineer=user),
    }[resource]


# which permission decides visibility (quotes & payments follow the request they belong to)
VIEW_KEY = {"contacts": "contacts.view", "deals": "deals.view", "properties": "properties.view",
            "activities": "activities.view", "documents": "documents.view", "quotes": "deals.view",
            "payments": "deals.view"}


def scoped(qs, user, resource: str, key: str | None = None):
    """Limit a queryset to what the user may see (or edit/delete, with `key`)."""
    s = scope(user, key or VIEW_KEY[resource])
    if s == ALL:
        return qs
    if s == OWN:
        return qs.filter(own_q(resource, user))
    return qs.none()


def is_own(user, resource: str, obj) -> bool:
    # fast paths from fields already loaded; only contacts / properties / documents may need a query
    uid = user.pk
    if resource == "deals":
        return uid in (obj.assignee_id, obj.engineer_id)
    if resource == "activities":
        return uid in (obj.assignee_id, obj.created_by_id)
    if resource in ("quotes", "payments"):
        return uid in (obj.deal.assignee_id, obj.deal.engineer_id)
    if getattr(obj, "assignee_id", None) == uid or getattr(obj, "uploaded_by_id", None) == uid:
        return True
    return type(obj)._default_manager.filter(own_q(resource, user), pk=obj.pk).exists()


def access_of(user, resource: str, obj) -> dict:
    """What the user may do with this record — sent with each record so the UI shows only usable buttons."""
    return {"edit": can(user, f"{resource}.edit", obj, resource) if resource != "documents" else False,
            "delete": can(user, f"{resource}.delete", obj, resource)}


def can(user, key: str, obj=None, resource: str | None = None) -> bool:
    """Bool permission, or scope permission checked against one record ("own" needs the record to be mine)."""
    v = perms_for(user).get(key)
    if v in (None, False, NONE):
        return False
    if v in (True, ALL) or obj is None:
        return True
    return is_own(user, resource or key.split(".")[0], obj)

