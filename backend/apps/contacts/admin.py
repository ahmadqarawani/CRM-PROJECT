from django.contrib import admin

from .models import Contact, ContactPhone

for model in (Contact, ContactPhone,):
    admin.site.register(model)
