"use server";

import { eq } from "drizzle-orm";
import { tzToDefaultCountry } from "@realm/commons";
import type { Country as CountryCode } from "react-phone-number-input";
import { db } from "@/db/client";
import { deliveryZones, leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import type { ZoneLike } from "@/lib/catalog/postal";

export type QuickAddSource = { key: string; label: string; subs: { key: string; label: string }[] };
export type QuickAddCatalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string }[];
  durations: { weeks: number }[];
};
export type QuickAddData = {
  defaultCountry: CountryCode;
  sources: QuickAddSource[];
  zones: ZoneLike[];
  catalog: QuickAddCatalog;
  enabledSlots: { key: string; label: string }[];
};

// The full data bundle every add-popup needs. Staff-only. Fetched lazily by the
// header quick-add provider on first open, then cached client-side — so it never
// taxes a normal page render. Also the single source the order/inquiry/customer
// pages could adopt to drop their duplicate loaders.
export async function loadQuickAddData(): Promise<QuickAddData> {
  await requireStaff();

  const [{ timezone }, sourceRows, subRows, zones, catalog, slots] = await Promise.all([
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
  ]);

  const sources = sourceRows
    .filter((s) => s.active)
    .map((s) => ({
      key: s.key,
      label: s.label,
      subs: subRows.filter((sub) => sub.active && sub.sourceId === s.id).map((sub) => ({ key: sub.key, label: sub.label })),
    }));

  return {
    defaultCountry: tzToDefaultCountry(timezone),
    sources,
    zones,
    catalog: {
      plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
      mealSizes: catalog.mealSizes.map((m) => ({ id: m.publicId, name: m.name, diet: m.diet })),
      frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name })),
      durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
    },
    enabledSlots: slots.map((s) => ({ key: s.key, label: s.label })),
  };
}
