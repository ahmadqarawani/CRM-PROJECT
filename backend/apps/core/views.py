from rest_framework import permissions, viewsets


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or bool(request.user and request.user.is_staff)


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_staff)


def can_delete(user) -> bool:
    return bool(user and (user.is_superuser or user.has_perm("core.delete_records")))


class DeletePermission(permissions.BasePermission):
    """Everyone has the same rights, except hard delete: a per-user permission set by the admin."""

    message = "ما عندك صلاحية الحذف"

    def has_permission(self, request, view):
        return request.method != "DELETE" or can_delete(request.user)


def flag(request, name: str) -> bool | None:
    value = request.query_params.get(name)
    if value in (None, ""):
        return None
    return value.lower() in {"1", "true", "yes"}


class BaseViewSet(viewsets.ModelViewSet):
    """Archive (PATCH is_archived) for everyone; DELETE only with the delete permission."""

    permission_classes = [permissions.IsAuthenticated, DeletePermission]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def filter_queryset(self, queryset):
        """Always end the ordering with the pk: with ties (e.g. 200 requests that all "need attention") the
        database may order them differently per query, and a card would then show on two pages or on none."""
        qs = super().filter_queryset(queryset)
        if self.action != "list" or not hasattr(qs, "query"):
            return qs
        order = list(qs.query.order_by) or list(qs.model._meta.ordering)
        if not {"pk", "-pk", "id", "-id"} & set(order):
            qs = qs.order_by(*order, "-pk")
        return qs

    def archived_filter(self, qs):
        archived = flag(self.request, "archived")
        return qs.filter(archived_at__isnull=not archived) if archived else qs.filter(archived_at__isnull=True)

    def mine(self, qs, field="assignee"):
        value = self.request.query_params.get("assignee")
        if value:
            qs = qs.filter(**{f"{field}_id": self.request.user.pk if value == "me" else value})
        return qs
