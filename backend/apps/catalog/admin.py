from django.contrib import admin

from . import models as m

for model in (m.Source, m.LostReason, m.Location, m.PropertyType, m.FinishLevel, m.ServiceType, m.OwnershipType,
              m.Feature, m.Tag):
    admin.site.register(model)
