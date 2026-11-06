from rest_framework import permissions, viewsets

from apps.access.permissions import Perm, RolePermission
from apps.access.services import scoped


def flag(request, name: str) -> bool | None:
    value = request.query_params.get(name)
    if value in (None, ""):
        return None
    return value.lower() in {"1", "true", "yes"}


class BaseViewSet(viewsets.ModelViewSet):
    """Role-based: `resource` names the permission group (contacts, deals…). Every query is limited to what the
    user may see (none / own / all); create/edit/delete need the matching permission (see apps.access)."""

    resource: str = ""
    permission_classes = [permissions.IsAuthenticated, RolePermission]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def filter_queryset(self, queryset):
        """Scope to what the user may see, then always end the ordering with the pk: with ties (e.g. 200 requests
        that all "need attention") the database may order them differently per query, and a card would then show
        on two pages or on none."""
        qs = super().filter_queryset(queryset)
        if self.resource and hasattr(qs, "query"):
            qs = scoped(qs, self.request.user, self.resource)
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


__all__ = ["BaseViewSet", "Perm", "flag"]
