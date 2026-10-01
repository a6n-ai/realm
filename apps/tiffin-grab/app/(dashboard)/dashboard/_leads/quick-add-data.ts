"use server";

import { savePct } from "@/lib/pricing/discounts";
import { eq } from "drizzle-orm";
import type { Country as CountryCode } from "react-phone-number-input";
import { db } from "@/db/client";
import { deliveryZones, leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import type { ZoneLike } from "@/lib/catalog/postal";
import type { CustomMealCategory } from "../orders/custom-meal-builder";

export type QuickAddSource = { key: string; label: string; subs: { key: string; label: string }[] };
export type QuickAddCatalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string; trial?: boolean }[];
  frequencies: { key: string; name: string; weekdays?: string[] | null; savePct?: number }[];
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  durations: { weeks: number }[];
};
export type QuickAddData = {
  defaultCountry: CountryCode;
  currency: string;
  sources: QuickAddSource[];
  zones: ZoneLike[];
  catalog: QuickAddCatalog;
  enabledSlots: { key: string; label: string }[];
  categories: CustomMealCategory[];
};

// The full data bundle every add-popup needs. Staff-only. Fetched lazily by the
// header quick-add provider on first open, then cached client-side — so it never
// taxes a normal page render. Also the single source the order/inquiry/customer
// pages could adopt to drop their duplicate loaders.
export async function loadQuickAddData(): Promise<QuickAddData> {
  await requireStaff();

  const [{ defaultCountry, currency }, sourceRows, subRows, zones, catalog, slots, planKeys] = await Promise.all([
    getAppSettings(),
    db.select({ id: leadSources.id, key: leadSources.key, label: leadSources.label, active: leadSources.active }).from(leadSources),
    db
      .select({ sourceId: leadSubsources.sourceId, key: leadSubsources.key, label: leadSubsources.label, active: leadSubsources.active })
      .from(leadSubsources),
    db
      .select({ name: deliveryZones.name, postalPrefixes: deliveryZones.postalPrefixes, slotWindow: deliveryZones.slotWindow, active: deliveryZones.active })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true)),
    loadCatalogSnapshot(),
    dishCategoriesService.enabledCategories(),
    dishCategoriesService.planKeysByCategoryKey(),
  ]);

  const sources = sourceRows
    .filter((s) => s.active)
    .map((s) => ({
      key: s.key,
      label: s.label,
      subs: subRows.filter((sub) => sub.active && sub.sourceId === s.id).map((sub) => ({ key: sub.key, label: sub.label })),
    }));

  return {
    defaultCountry,
    currency,
    sources,
    zones,
    catalog: {
      plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
      mealSizes: listableMealSizes(catalog.mealSizes).map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey, trial: m.trial, servesWeekends: m.servesWeekends })),
      frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays, savePct: savePct(catalog.discounts, "delivery", f.publicId, 0, catalog.maxDiscountPct) })),
    minTiffinsPerWeek: catalog.minTiffinsPerWeek,
    maxTiffinsPerWeek: catalog.maxTiffinsPerWeek,
      durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
    },
    enabledSlots: slots.map((s) => ({ key: s.key, label: s.label })),
    categories: slots.map((s) => ({ key: s.key, label: s.label, tuUnitType: s.tuUnitType, tuUnitSize: Number(s.tuUnitSize), tuUnitLabel: s.tuUnitLabel, planKeys: planKeys.get(s.key) ?? [] })),
  };
}
