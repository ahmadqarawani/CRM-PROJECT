"""Read-only aggregates: dashboard ("Today"), global search, timeline, audit log, reports."""

from datetime import timedelta

from auditlog.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.access.permissions import DENIED, Perm
from apps.access.services import has, scoped
from apps.activities.api import ActivitySerializer
from apps.activities.models import Activity
from apps.contacts.models import Contact
from apps.contacts.services import search_q
from apps.deals.api import DealSerializer
from apps.deals.models import Deal, Stage
from apps.deals.overdue import with_attention
from apps.documents.models import Document
from apps.notifications.models import Notification
from apps.properties.models import Property

from .text import normalize_ar


def _deals():
    return with_attention(Deal.objects.select_related("contact", "stage", "assignee", "source", "location"))


class DashboardView(APIView):
    @extend_schema(parameters=[OpenApiParameter("scope", str, enum=["me", "all"])], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        now = timezone.now()
        user = request.user
        # the whole team"s day needs reports.team; otherwise it is always "my" day
        mine = request.query_params.get("scope", "me") != "all" or not has(user, "reports.team")
        start = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
        acts = Activity.objects.select_related("contact", "deal", "assignee").filter(done_at__isnull=True,
                                                                                    due_at__isnull=False)
        deals = _deals().filter(stage__type="OPEN", archived_at__isnull=True)
        acts, deals = scoped(acts, user, "activities"), scoped(deals, user, "deals")
        if mine:
            acts, deals = acts.filter(assignee=user), deals.filter(assignee=user)
        ctx = {"request": request}
        by_stage = dict(deals.values_list("stage_id").annotate(n=Count("id")))
        return Response({
            "overdue": ActivitySerializer(acts.filter(due_at__lt=now).order_by("due_at")[:30], many=True,
                                          context=ctx).data,
            "overdue_count": acts.filter(due_at__lt=now).count(),
            "today": ActivitySerializer(acts.filter(due_at__gte=now, due_at__lt=start + timedelta(days=1))
                                        .order_by("due_at"), many=True, context=ctx).data,
            "no_next_step": DealSerializer(deals.filter(r_no_next_step=True).order_by("-created_at")[:30], many=True,
                                           context=ctx).data,
            "no_next_step_count": deals.filter(r_no_next_step=True).count(),
            "stuck_count": deals.filter(r_stuck=True).count(),
            "open_deals": deals.count(),
            "pipelines": [{"id": s.pk, "pipeline": s.pipeline, "name": s.name, "color": s.color,
                           "count": by_stage.get(s.pk, 0)}
                          for s in Stage.objects.filter(is_active=True, type="OPEN")],
            "unread_notifications": Notification.objects.filter(user=user, read_at__isnull=True).count(),
            "new_contacts_this_month": Contact.objects.filter(created_at__gte=start.replace(day=1)).count(),
        })


class SearchView(APIView):
    @extend_schema(parameters=[OpenApiParameter("q", str, required=True)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"contacts": [], "deals": [], "properties": []})
        u = request.user
        contacts = scoped(Contact.objects.active(), u, "contacts").filter(search_q(q)).distinct().prefetch_related("phones")[:10]
        return Response({
            "contacts": [{"id": c.pk, "name": c.display_name, "phone": next((p.number for p in c.phones.all()), None)}
                         for c in contacts],
            "deals": list(scoped(Deal.objects.active(), u, "deals").filter(Q(title__icontains=q) | Q(contact__in=contacts))
                          .values("id", "title", "kind", "contact_id")[:10]),
            "properties": list(scoped(Property.objects.active(), u, "properties").filter(search_text__icontains=normalize_ar(q))
                               .values("id", "code", "address", "owner_id")[:10]),
        })


def _visible_or_404(user, scope: dict):
    """The record a timeline / audit log belongs to must be one the user may see."""
    for field, model, resource in (("contact_id", Contact, "contacts"), ("deal_id", Deal, "deals"),
                                   ("property_id", Property, "properties")):
        if (pk := scope.get(field)) and not scoped(model.objects.filter(pk=pk), user, resource).exists():
            raise NotFound()


class TimelineView(APIView):
    """Activities (done + planned + system) and uploaded files for a contact, deal or property."""

    @extend_schema(parameters=[OpenApiParameter("contact", int), OpenApiParameter("deal", int),
                               OpenApiParameter("property", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        p = request.query_params
        scope = {f"{k}_id": p[k] for k in ("contact", "deal", "property") if p.get(k)}
        if not scope:
            raise serializers.ValidationError({"non_field_errors": ["حدد contact أو deal أو property"]})
        _visible_or_404(request.user, scope)
        acts = scoped(Activity.objects.filter(**scope), request.user, "activities").select_related("contact", "deal", "assignee", "created_by")[:300]
        docs = scoped(Document.objects.active().filter(**scope), request.user, "documents").select_related("uploaded_by")[:100]
        items = [{"kind": "activity", "at": (a.done_at or a.due_at or a.created_at),
                  **ActivitySerializer(a, context={"request": request}).data} for a in acts]
        items += [{"kind": "document", "at": d.created_at, "id": d.pk, "name": d.original_name,
                   "category": d.category, "by": d.uploaded_by.get_full_name() if d.uploaded_by else None,
                   "url": f"/api/v1/documents/{d.pk}/file/"} for d in docs]
        items.sort(key=lambda i: i["at"], reverse=True)
        return Response(items)


AUDITED = {"contact": Contact, "deal": Deal, "property": Property, "activity": Activity}

# Arabic labels for the audit log; fields not listed here (ids, timestamps, search keys) are hidden.
FIELD_LABELS = {
    "name": "الاسم", "title": "العنوان المختصر", "kind": "النوع", "stage": "المرحلة", "temperature": "الحرارة",
    "source": "المصدر", "assignee": "المسؤول", "engineer": "مهندس المعاينة", "property": "العقار", "contact": "العميل",
    "owner": "المالك", "owner_role": "صفة المالك", "location": "المنطقة", "address": "العنوان",
    "expected_amount": "القيمة المتوقعة", "contract_amount": "قيمة العقد", "commission_amount": "العمولة",
    "currency": "العملة", "lost_reason": "سبب الخسارة", "lost_notes": "ملاحظات الخسارة", "closed_at": "تاريخ الإغلاق",
    "expected_close": "الإغلاق المتوقع", "execution_started_at": "بدء التنفيذ", "handover_expected": "التسليم المتوقع",
    "archived_at": "الأرشفة", "referred_by": "مين عرّفه", "email": "الإيميل", "notes": "ملاحظات",
    "merged_into": "انضم إلى", "tags": "الوسوم", "code": "الكود", "property_type": "نوع العقار", "listing": "العرض",
    "status": "الحالة", "area_m2": "المساحة", "area_note": "ملاحظة المساحة", "rooms": "الغرف", "bathrooms": "الحمامات",
    "floor": "الطابق", "floor_note": "ملاحظة الطابق", "layout_note": "التقسيم", "building_state": "حالة البناء",
    "finish_level": "الإكساء", "ownership_type": "نوع الملكية", "price": "السعر", "rent_monthly": "الإيجار الشهري",
    "price_note": "ملاحظة السعر", "commission_pct": "نسبة العمولة", "description": "الوصف", "features": "المزايا",
    "type": "النوع", "subject": "الموضوع", "due_at": "الموعد", "done_at": "تاريخ الإنجاز", "outcome": "النتيجة",
    "deal": "الطلب", "body": "التفاصيل",
}


def _audit_value(field, raw):
    """auditlog stores everything as strings ("None", pks): turn it into what a person would read."""
    if raw in (None, "None", ""):
        return "—"
    if field is None:
        return raw
    if field.is_relation and field.related_model is not None:
        obj = field.related_model._default_manager.filter(pk=raw).first() if str(raw).isdigit() else None
        return str(obj) if obj is not None else f"#{raw}"
    if field.choices:
        return str(dict(field.flatchoices).get(raw, raw))
    return raw


def _audit_changes(model, entry):
    if entry.action == LogEntry.Action.CREATE:
        return []  # "created" says it all; listing every initial field is noise
    fields = {f.name: f for f in model._meta.get_fields()}
    out = []
    for name, change in (entry.changes_dict or {}).items():
        label = FIELD_LABELS.get(name)
        if label is None:
            continue
        if isinstance(change, dict):  # many-to-many: {"type": "m2m", "operation": "add"|"delete", "objects": [...]}
            sign = "+" if change.get("operation") == "add" else "−"
            out.append({"field": label, "old": "", "new": "، ".join(f"{sign} {o}" for o in change.get("objects", []))})
            continue
        old, new = change
        f = fields.get(name)
        out.append({"field": label, "old": _audit_value(f, old), "new": _audit_value(f, new)})
    return out


MONEY_LABELS = {FIELD_LABELS[k] for k in ("expected_amount", "contract_amount", "commission_amount")}


class AuditView(APIView):
    """Who changed what and when (django-auditlog), for one record, in readable Arabic."""

    @extend_schema(parameters=[OpenApiParameter("model", str, enum=list(AUDITED), required=True),
                               OpenApiParameter("id", int, required=True)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        model = AUDITED.get(request.query_params.get("model", ""))
        if model is None:
            raise serializers.ValidationError({"model": ["مش مدعوم"]})
        if not has(request.user, "audit.view"):
            raise PermissionDenied(DENIED)
        key = {Contact: "contact", Deal: "deal", Property: "property"}.get(model)
        if key:
            _visible_or_404(request.user, {f"{key}_id": request.query_params.get("id")})
        ct = ContentType.objects.get_for_model(model)
        money_ok = has(request.user, "finance.view")
        entries = (LogEntry.objects.filter(content_type=ct, object_pk=str(request.query_params.get("id")))
                   .select_related("actor").order_by("-timestamp")[:200])
        actions = {LogEntry.Action.CREATE: "أنشأ", LogEntry.Action.UPDATE: "عدّل", LogEntry.Action.DELETE: "حذف"}
        rows = []
        for e in entries:
            changes = _audit_changes(model, e)
            if not money_ok:
                changes = [c for c in changes if c["field"] not in MONEY_LABELS]
            if e.action == LogEntry.Action.UPDATE and not changes:
                continue  # only hidden fields changed (timestamps, search keys)
            rows.append({"at": e.timestamp, "action": actions.get(e.action, e.get_action_display()),
                         "by": (e.actor.get_full_name() or e.actor.get_username()) if e.actor else "النظام",
                         "changes": changes})
        return Response(rows)


class ReportView(APIView):
    permission_classes = [IsAuthenticated, Perm("reports.team")]
    """Simple counts for the weekly report / reports page: by source, by stage, lost reasons."""

    @extend_schema(parameters=[OpenApiParameter("days", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        since = timezone.now() - timedelta(days=int(request.query_params.get("days", 7)))
        new = Deal.objects.filter(created_at__gte=since)
        return Response({
            "since": since,
            "new_deals_by_source": list(new.values("source__name").annotate(n=Count("id")).order_by("-n")),
            "new_deals_by_kind": list(new.values("kind").annotate(n=Count("id")).order_by("-n")),
            "won": Deal.objects.filter(closed_at__gte=since, stage__type="WON").count(),
            "lost_by_reason": list(Deal.objects.filter(closed_at__gte=since, stage__type="LOST")
                                   .values("lost_reason__name").annotate(n=Count("id")).order_by("-n")),
            "open_by_stage": list(Deal.objects.filter(stage__type="OPEN", archived_at__isnull=True)
                                  .values("pipeline", "stage__name").annotate(n=Count("id"))
                                  .order_by("pipeline", "stage__order")),
            "activities_done": Activity.objects.filter(done_at__gte=since).exclude(type="SYSTEM").count(),
        })
