import { savePct } from "@/lib/pricing/discounts";
import { listableMealSizes, mealSizeAddons } from "@/lib/catalog/types";
import type { loadCatalogSnapshot } from "@/lib/catalog/load";

// The catalog slice the admin OrderForm picks from (New order, Estimate order).
export function orderFormCatalog(catalog: Awaited<ReturnType<typeof loadCatalogSnapshot>>) {
  return {
    plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
    mealSizes: listableMealSizes(catalog.mealSizes).map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey, trial: m.trial, servesWeekends: m.servesWeekends, allowedDays: m.allowedDays ?? null, addons: m.trial ? [] : mealSizeAddons(catalog) })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays, savePct: savePct(catalog.discounts, "delivery", f.publicId, 0, catalog.maxDiscountPct) })),
    minTiffinsPerWeek: catalog.minTiffinsPerWeek,
    timezone: catalog.timezone,
    cutoffHour: catalog.cutoffHour,
    maxTiffinsPerWeek: catalog.maxTiffinsPerWeek,
    durations: catalog.durations.map((d) => ({ weeks: d.weeks, savePct: savePct(catalog.discounts, "duration", d.publicId, d.weeks, catalog.maxDiscountPct) })),
  };
}
