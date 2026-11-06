from rest_framework.permissions import SAFE_METHODS, BasePermission

from .services import can, has

DENIED = "ما عندك صلاحية لهالشي"

CRUD = {"list": "view", "retrieve": "view", "create": "create", "update": "edit", "partial_update": "edit",
        "destroy": "delete"}


class RolePermission(BasePermission):
    """Viewsets declare `resource` ("contacts", "deals"…); CRUD actions map to resource.view/create/edit/delete,
    custom actions to `action_permissions = {"merge": "contacts.merge", "file": None (= view)}`.
    Object checks apply "own" scopes, and visibility itself is a queryset filter (BaseViewSet.filter_queryset)."""

    message = DENIED

    @staticmethod
    def key_for(view) -> str | None:
        action = getattr(view, "action", None)
        custom = getattr(view, "action_permissions", {})
        if action in custom:
            return custom[action] or f"{view.resource}.view"
        verb = CRUD.get(action, "view")
        return f"{getattr(view, 'perm_resource', view.resource)}.{verb}"

    def has_permission(self, request, view):
        return has(request.user, self.key_for(view))

    def has_object_permission(self, request, view, obj):
        key = self.key_for(view)
        resource = getattr(view, "resource", None)
        return can(request.user, key, obj, resource=resource if key.split(".")[0] == resource else None)


def Perm(key: str, *, read_open: bool = False):
    """A fixed permission for the whole view; with read_open, GETs only need a login (e.g. lookup lists)."""

    class _Perm(BasePermission):
        message = DENIED

        def has_permission(self, request, view):
            if read_open and request.method in SAFE_METHODS:
                return True
            return has(request.user, key)

    _Perm.__name__ = f"Perm[{key}]"
    return _Perm
