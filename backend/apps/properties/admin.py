from django.contrib import admin

from .models import Property

for model in (Property,):
    admin.site.register(model)
