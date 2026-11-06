from django.contrib import admin

from .models import Deal, Demand, DemandMatch, FinishingSpec, Payment, Quote, Stage

for model in (Stage, Deal, FinishingSpec, Demand, DemandMatch, Quote, Payment,):
    admin.site.register(model)
