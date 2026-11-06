from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView
from rest_framework.routers import SimpleRouter

from apps.accounts.views import (
    CsrfView,
    LoginView,
    LogoutView,
    MeView,
    SiteSettingsView,
    TestEmailView,
    UserAdminViewSet,
    UserListView,
)
from apps.activities.api import ActivityViewSet
from apps.catalog.api import VIEWSETS as CATALOG
from apps.contacts.api import ContactViewSet
from apps.core.overview import AuditView, DashboardView, ReportView, SearchView, TimelineView
from apps.deals.api import DealViewSet, HandOverView, PaymentViewSet, QuoteViewSet, StageViewSet
from apps.documents.api import DocumentViewSet
from apps.notifications.api import NotificationViewSet, PreferenceViewSet
from apps.properties.api import PropertyViewSet
from apps.realtime.views import event_stream

router = SimpleRouter()
router.register("contacts", ContactViewSet, basename="contact")
router.register("properties", PropertyViewSet, basename="property")
router.register("stages", StageViewSet, basename="stage")
router.register("deals", DealViewSet, basename="deal")
router.register("quotes", QuoteViewSet, basename="quote")
router.register("payments", PaymentViewSet, basename="payment")
router.register("activities", ActivityViewSet, basename="activity")
router.register("documents", DocumentViewSet, basename="document")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("notification-preferences", PreferenceViewSet, basename="notification-preference")
router.register("admin/users", UserAdminViewSet, basename="admin-user")
router.register("admin/hand-over", HandOverView, basename="hand-over")
for slug, viewset in CATALOG.items():
    router.register(f"catalog/{slug}", viewset, basename=f"catalog-{slug}")

api = [
    path("auth/csrf/", CsrfView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("users/", UserListView.as_view()),
    path("admin/settings/", SiteSettingsView.as_view()),
    path("admin/settings/test-email/", TestEmailView.as_view()),
    path("dashboard/", DashboardView.as_view()),
    path("search/", SearchView.as_view()),
    path("timeline/", TimelineView.as_view()),
    path("audit/", AuditView.as_view()),
    path("reports/", ReportView.as_view()),
    path("events/", event_stream),
    path("", include(router.urls)),
]

urlpatterns = [
    path("api/v1/", include(api)),
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns.append(path("api/schema/", SpectacularAPIView.as_view()))
