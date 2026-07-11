import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sharedCache } from "@/lib/cache";
import { deliveryFrequencies, deliveryZones, durationPackages, mealSizeItems, mealSizes, plans, pricingTiers } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import type { CatalogSnapshot } from "./types";

// Global, user-agnostic, rarely-changing catalog data hit by many RSC pages and
// the subscribe hot path. Cache it; catalog admin mutations call
// invalidateCatalogSnapshot(). 60s TTL bounds cross-instance staleness until a
// Redis tier broadcasts eviction.
const catalogCache = sharedCache("catalog");

export function invalidateCatalogSnapshot(): Promise<void> {
  return catalogCache.evictAll();
}

export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  return catalogCache.getOrSet("snapshot", fetchCatalogSnapshot);
}

async function fetchCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [planRows, mealRows, itemRows, freqRows, durRows, zoneRows, tierRows, tiffinSlots, healthySlots] = await Promise.all([
    db.select().from(plans).where(eq(plans.active, true)),
    db.select().from(mealSizes).where(eq(mealSizes.active, true)),
    db.select().from(mealSizeItems).orderBy(mealSizeItems.sortOrder),
    db.select().from(deliveryFrequencies).where(eq(deliveryFrequencies.active, true)),
    db.select().from(durationPackages).where(eq(durationPackages.active, true)),
    db.select().from(deliveryZones).where(eq(deliveryZones.active, true)),
    db.select().from(pricingTiers).where(eq(pricingTiers.active, true)),
    dishCategoriesService.forPlanType("tiffin"),
    dishCategoriesService.forPlanType("healthy"),
  ]);
  const slotKeys = { tiffin: tiffinSlots.map((s) => s.key), healthy: healthySlots.map((s) => s.key) };
  const itemsByMealSize = new Map<bigint, typeof itemRows>();
  for (const item of itemRows) {
    const bucket = itemsByMealSize.get(item.mealSizeId);
    if (bucket) bucket.push(item);
    else itemsByMealSize.set(item.mealSizeId, [item]);
  }

  return {
    plans: planRows.map((p) => ({ id: p.id, publicId: p.publicId, key: p.key, name: p.name, description: p.description, planType: p.planType, offeredSlots: slotKeys[p.planType as "tiffin" | "healthy"], allowedStartDays: p.allowedStartDays })),
    mealSizes: mealRows.map((m) => ({
      id: m.id, publicId: m.publicId, key: m.key, name: m.name, planType: m.planType, tier: m.tier, diet: m.diet, components: m.components,
      items: (itemsByMealSize.get(m.id) ?? []).map((i) => ({ name: i.name, category: i.category, qty: i.qty, weightValue: i.weightValue == null ? null : Number(i.weightValue), weightUnit: i.weightUnit })),
      kcalMin: m.kcalMin, kcalMax: m.kcalMax, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG,
      basePrice: Number(m.basePrice),
      trial: m.trial,
    })),
    frequencies: freqRows.map((f) => ({ id: f.id, publicId: f.publicId, key: f.key, name: f.name, daysPerWeek: f.daysPerWeek, courierDiscountPct: f.courierDiscountPct })),
    durations: durRows.map((d) => ({ id: d.id, publicId: d.publicId, weeks: d.weeks, discountPct: d.discountPct })),
    zones: zoneRows.map((z) => ({ id: z.id, publicId: z.publicId, name: z.name, postalPrefixes: z.postalPrefixes, slotWindow: z.slotWindow, active: z.active })),
    tiers: tierRows.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, upliftPct: Number(t.upliftPct) })),
  };
}
