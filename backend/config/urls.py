from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView
from rest_framework.routers import SimpleRouter

from apps.accounts.views import CsrfView, LoginView, LogoutView, MeView, UserListView
from apps.activities.views import ActivityViewSet
from apps.apartments.views import ApartmentViewSet
from apps.clients.views import ClientViewSet
from apps.core.overview import DashboardView, SearchView, TimelineView
from apps.documents.views import DocumentViewSet
from apps.pipeline.views import RequestViewSet, StageViewSet
from apps.realtime.views import event_stream
from apps.tasks.views import NotificationViewSet, TaskViewSet

router = SimpleRouter()
router.register("clients", ClientViewSet, basename="client")
router.register("apartments", ApartmentViewSet, basename="apartment")
router.register("stages", StageViewSet, basename="stage")
router.register("requests", RequestViewSet, basename="request")
router.register("activities", ActivityViewSet, basename="activity")
router.register("documents", DocumentViewSet, basename="document")
router.register("tasks", TaskViewSet, basename="task")
router.register("notifications", NotificationViewSet, basename="notification")

api = [
    path("auth/csrf/", CsrfView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("users/", UserListView.as_view()),
    path("timeline/", TimelineView.as_view()),
    path("dashboard/", DashboardView.as_view()),
    path("search/", SearchView.as_view()),
    path("events/", event_stream),
    path("", include(router.urls)),
]

urlpatterns = [
    path("api/v1/", include(api)),
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns.append(path("api/schema/", SpectacularAPIView.as_view()))
