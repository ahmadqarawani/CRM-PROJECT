from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clients.models import Client
from apps.pipeline.models import Stage

User = get_user_model()


@pytest.fixture(autouse=True)
def _settings(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    settings.SERVE_FILES_WITH_X_ACCEL = False
    settings.NO_CONTACT_DAYS = 5
    settings.TIME_ZONE = "Asia/Damascus"


@pytest.fixture(autouse=True)
def _clear_cache():
    from django.core.cache import cache

    cache.clear()


@pytest.fixture
def user(db):
    return User.objects.create_user("staff", password="s3cret-pass!", first_name="سامر")


@pytest.fixture
def admin(db):
    return User.objects.create_user("boss", password="s3cret-pass!", is_staff=True)


def _client_for(u):
    c = APIClient()
    c.force_authenticate(u)
    return c


@pytest.fixture
def api(user):
    return _client_for(user)


@pytest.fixture
def admin_api(admin):
    return _client_for(admin)


@pytest.fixture
def anon():
    return APIClient()


@pytest.fixture
def stages(db):
    # transactional tests flush the DB (and the seed migration's rows with it): re-seed if needed
    if not Stage.objects.exists():
        from importlib import import_module

        from django.apps import apps as django_apps

        import_module("apps.pipeline.migrations.0002_seed_stages").seed(django_apps, None)
    return {s.name: s for s in Stage.objects.all()}


@pytest.fixture
def client_obj(db):
    return Client.objects.create(name="أحمد سليمان", phone="0991 234 567", city="دمشق")


@pytest.fixture
def make_request(stages, user):
    from apps.pipeline import services

    def make(client, **kw):
        kw.setdefault("title", "إكساء")
        return services.create_request(by=user, client=client, **kw)

    return make


def ago(**kw):
    return timezone.now() - timedelta(**kw)
