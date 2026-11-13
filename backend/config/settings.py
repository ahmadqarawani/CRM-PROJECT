"""Django settings. Every value that differs between dev and prod comes from the environment
(or a local `.env` file next to manage.py, which never overrides real env vars)."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv(BASE_DIR / ".env")


def env(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    value = os.environ.get(key)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(key: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(key, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = env("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY is required when DJANGO_DEBUG is off")
    SECRET_KEY = "dev-only-insecure-key"

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "drf_spectacular",
    "auditlog",
    "apps.core",
    "apps.access",
    "apps.accounts",
    "apps.catalog",
    "apps.contacts",
    "apps.properties",
    "apps.deals",
    "apps.activities",
    "apps.documents",
    "apps.notifications",
    "apps.realtime",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "auditlog.middleware.AuditlogMiddleware",  # records which user made each change
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", "crm"),
        "USER": env("DB_USER", "postgres"),
        "PASSWORD": env("DB_PASSWORD", ""),
        "HOST": env("DB_HOST", "127.0.0.1"),
        "PORT": env("DB_PORT", "5432"),
        # Django docs: under ASGI disable persistent connections and use the built-in pool
        # (psycopg 3). One pool per worker process: workers x max_size < max_connections.
        "CONN_MAX_AGE": 0,
        "OPTIONS": {"pool": {"min_size": 1, "max_size": int(env("DB_POOL_MAX", "8"))}},
    }
}

# Rate-limit state (login throttle) must be shared by all worker processes; LocMemCache is
# per-process. A database cache keeps us on Postgres only. Run `manage.py createcachetable`.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "ar"
TIME_ZONE = env("TIME_ZONE", "UTC")  # set to your local zone; "today" for reminders uses it
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = Path(env("MEDIA_ROOT", str(BASE_DIR / "media")))
MEDIA_URL = "/media/"  # never routed publicly; files go through documents/{id}/file/

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- security (prod defaults, relaxed only when DEBUG) ---
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # the SPA reads it to send X-CSRFToken
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", "0"))
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.auth.SessionAuth"],
    "NUM_PROXIES": int(env("NUM_PROXIES", "1")),  # nginx in front: client IP for the login throttle
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.Pagination",
    "DEFAULT_FILTER_BACKENDS": ["rest_framework.filters.OrderingFilter"],
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_RATES": {"login": env("LOGIN_THROTTLE_RATE", "10/min"),
                               "password_reset": env("PASSWORD_RESET_THROTTLE_RATE", "10/hour")},
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "CRM API",
    "VERSION": "1.0.0",
    "COMPONENT_SPLIT_REQUEST": True,  # separate read/write components (nested read, *_id write)
    "SERVE_INCLUDE_SCHEMA": False,
    # several models have a "type"/"kind" choice field: give each enum a stable, readable name
    "ENUM_NAME_OVERRIDES": {
        "ActivityTypeEnum": "apps.activities.models.Activity.Type",
        "StageTypeEnum": "apps.deals.models.Stage.Type",
        "DealKindEnum": "apps.deals.models.Deal.Kind",
        "NotificationKindEnum": "apps.notifications.models.Notification.Kind",
        "PipelineEnum": "apps.deals.models.Pipeline",
    },
}

# --- domain settings ---
MAX_UPLOAD_MB = int(env("MAX_UPLOAD_MB", "25"))
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # non-file request body
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # bigger uploads stream to a temp file
SERVE_FILES_WITH_X_ACCEL = env_bool("SERVE_FILES_WITH_X_ACCEL", not DEBUG)
X_ACCEL_PREFIX = env("X_ACCEL_PREFIX", "/protected-media/")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}

# audit log on everything (django-auditlog): who changed which field, when
AUDITLOG_INCLUDE_ALL_MODELS = True
AUDITLOG_EXCLUDE_TRACKING_MODELS = ("sessions", "auditlog", "notifications", "contenttypes", "admin")
AUDITLOG_DISABLE_REMOTE_ADDR = False

# where people open the app: links in password-reset emails / password_link (the API builds them from the request)
APP_URL = env("APP_URL", "http://localhost:5173")
PASSWORD_RESET_TIMEOUT = 60 * 60 * 24  # reset links work for 24 hours
