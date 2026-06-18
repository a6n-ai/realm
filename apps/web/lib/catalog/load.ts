import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans } from "@/db/schema";
import type { CatalogSnapshot } from "./types";

export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [planRows, mealRows, addonRows, freqRows, durRows, zoneRows] = await Promise.all([
    db.select().from(plans),
    db.select().from(mealSizes),
    db.select().from(addons),
    db.select().from(deliveryFrequencies),
    db.select().from(durationPackages),
    db.select().from(deliveryZones),
  ]);

  return {
    plans: planRows.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description })),
    mealSizes: mealRows.map((m) => ({
      id: m.id, key: m.key, name: m.name, tier: m.tier, diet: m.diet, components: m.components,
      kcalMin: m.kcalMin, kcalMax: m.kcalMax, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG,
      basePrice: Number(m.basePrice),
    })),
    addons: addonRows.map((a) => ({ key: a.key, name: a.name, pricePerWeek: Number(a.pricePerWeek) })),
    frequencies: freqRows.map((f) => ({ id: f.id, key: f.key, name: f.name, daysPerWeek: f.daysPerWeek, courierDiscountPct: f.courierDiscountPct })),
    durations: durRows.map((d) => ({ id: d.id, weeks: d.weeks, discountPct: d.discountPct })),
    zones: zoneRows.map((z) => ({ id: z.id, name: z.name, postalPrefixes: z.postalPrefixes, slotWindow: z.slotWindow, active: z.active })),
  };
}
