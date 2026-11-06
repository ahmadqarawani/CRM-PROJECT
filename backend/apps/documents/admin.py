from django.contrib import admin

from .models import Document

for model in (Document,):
    admin.site.register(model)
