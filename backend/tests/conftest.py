from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture(autouse=True)
def _settings(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    settings.SERVE_FILES_WITH_X_ACCEL = False
    settings.TIME_ZONE = "Asia/Damascus"


@pytest.fixture(autouse=True)
def _seed(db):
    """Transactional tests flush the DB (and the seed migration's rows): re-seed when needed."""
    from django.apps import apps

    from apps.catalog.seed import run
    from apps.deals.models import Stage

    if not Stage.objects.exists():
        run(apps)
    from apps.access.seed import seed_roles

    seed_roles()
    from django.core.cache import cache

    cache.clear()


def with_role(u, slug):
    from apps.access.models import Role, UserAccess

    UserAccess.objects.update_or_create(user=u, defaults={"role": Role.objects.get(slug=slug)})
    return u


@pytest.fixture
def user(db):
    """A sales agent: sees everything, edits own records, no delete/merge."""
    return with_role(User.objects.create_user("staff", password="s3cret-pass!", first_name="سامر"), "agent")


@pytest.fixture
def admin(db):
    return with_role(User.objects.create_user("boss", password="s3cret-pass!"), "admin")


def client_for(u):
    c = APIClient()
    c.force_authenticate(u)
    return c


@pytest.fixture
def api(user):
    return client_for(user)


@pytest.fixture
def admin_api(admin):
    return client_for(admin)


@pytest.fixture
def stage():
    from apps.deals.models import Stage

    return lambda pipeline, name: Stage.objects.get(pipeline=pipeline, name=name)


@pytest.fixture
def lookup():
    from apps.catalog import models as m

    return lambda model, name: getattr(m, model).objects.get(name=name)


@pytest.fixture
def contact(user):
    from apps.contacts.services import create_contact

    return create_contact(name="أحمد سليمان", phones=["0933 418 288"], by=user)


def ago(**kw):
    return timezone.now() - timedelta(**kw)


def later(**kw):
    return timezone.now() + timedelta(**kw)
