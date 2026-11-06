from django.contrib import admin

from .models import Notification, NotificationPreference

for model in (Notification, NotificationPreference,):
    admin.site.register(model)
