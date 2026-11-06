from django.contrib import admin

from .models import Activity

for model in (Activity,):
    admin.site.register(model)
