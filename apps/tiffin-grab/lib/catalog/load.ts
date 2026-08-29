import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { sharedCache } from "@/lib/cache";
import { deliveryFrequencies, deliveryZones, dishCategories, durationPackages, mealSizeItems, mealSizes, plans, pricingTiers } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { formatTuHuman } from "@/lib/menu/format-tu";
import type { CatalogSnapshot } from "./types";

// Global, user-agnostic, rarely-changing catalog data hit by many RSC pages and
// the subscribe hot path. Cache it; catalog admin mutations call
// invalidateCatalogSnapshot(). 60s TTL bounds cross-instance staleness until a
// Redis tier broadcasts eviction.
const catalogCache = sharedCache("catalog");

export function invalidateCatalogSnapshot(): Promise<void> {
  return catalogCache.evictAll();
}

// orgId scopes rows to a franchise's own catalog rows plus any row with a null
// organizationId (shared/global catalog, the only kind that has existed so
// far). Omit it (the ~100 existing callers) to keep seeing every row,
// unscoped — unchanged behavior.
export async function loadCatalogSnapshot(orgId?: string | null): Promise<CatalogSnapshot> {
  return catalogCache.getOrSet(`snapshot:${orgId ?? "global"}`, () => fetchCatalogSnapshot(orgId));
}

function scopedTo(column: AnyPgColumn, orgId: string | null | undefined): SQL | undefined {
  return orgId ? or(isNull(column), eq(column, orgId)) : undefined;
}

async function fetchCatalogSnapshot(orgId?: string | null): Promise<CatalogSnapshot> {
  const [planRows, mealRows, itemRows, freqRows, durRows, zoneRows, tierRows, tiffinSlots, healthySlots, categoryRows] = await Promise.all([
    db.select().from(plans).where(and(eq(plans.active, true), scopedTo(plans.organizationId, orgId))),
    db.select().from(mealSizes).where(and(eq(mealSizes.active, true), scopedTo(mealSizes.organizationId, orgId))),
    db.select().from(mealSizeItems).orderBy(mealSizeItems.sortOrder),
    db.select().from(deliveryFrequencies).where(and(eq(deliveryFrequencies.active, true), scopedTo(deliveryFrequencies.organizationId, orgId))),
    db.select().from(durationPackages).where(and(eq(durationPackages.active, true), scopedTo(durationPackages.organizationId, orgId))),
    db.select().from(deliveryZones).where(and(eq(deliveryZones.active, true), scopedTo(deliveryZones.organizationId, orgId))),
    db.select().from(pricingTiers).where(and(eq(pricingTiers.active, true), scopedTo(pricingTiers.organizationId, orgId))),
    dishCategoriesService.forPlanType("tiffin"),
    dishCategoriesService.forPlanType("healthy"),
    db.select({ key: dishCategories.key, tuUnitType: dishCategories.tuUnitType, tuUnitSize: dishCategories.tuUnitSize, tuUnitLabel: dishCategories.tuUnitLabel }).from(dishCategories),
  ]);
  const slotKeys = { tiffin: tiffinSlots.map((s) => s.key), healthy: healthySlots.map((s) => s.key) };
  const tuByCategory = new Map(categoryRows.map((c) => [c.key, { tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel }]));
  // Same {key -> label} the customer day view threads into day-detail.tsx —
  // built from slot rows already fetched above, not a new lookup.
  const categoryLabels: Record<string, string> = {};
  for (const s of [...tiffinSlots, ...healthySlots]) categoryLabels[s.key] = s.label;
  const planKeyById = new Map(planRows.map((p) => [p.id, p.key]));
  const itemsByMealSize = new Map<bigint, typeof itemRows>();
  for (const item of itemRows) {
    const bucket = itemsByMealSize.get(item.mealSizeId);
    if (bucket) bucket.push(item);
    else itemsByMealSize.set(item.mealSizeId, [item]);
  }
  return {
    plans: planRows.map((p) => ({ id: p.id, publicId: p.publicId, key: p.key, name: p.name, description: p.description, planType: p.planType, offeredSlots: slotKeys[p.planType as "tiffin" | "healthy"], allowedStartDays: p.allowedStartDays })),
    mealSizes: mealRows.map((m) => ({
      id: m.id, publicId: m.publicId, key: m.key, name: m.name, description: m.description, planId: m.planId, planKey: planKeyById.get(m.planId)!, tier: m.tier, components: m.components,
      items: (itemsByMealSize.get(m.id) ?? []).map((i) => {
        const tuAmount = Number(i.tuAmount);
        const cat = tuByCategory.get(i.category) ?? null;
        return {
          name: i.name, category: i.category, tuAmount,
          maxTuAmount: i.maxTuAmount == null ? null : Number(i.maxTuAmount),
          portion: cat == null ? null : formatTuHuman(cat, tuAmount),
        };
      }),
      kcalMin: m.kcalMin, kcalMax: m.kcalMax, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG,
      basePrice: Number(m.basePrice),
      discountType: m.discountType, discountValue: Number(m.discountValue),
      trial: m.trial,
    })),
    frequencies: freqRows.map((f) => ({ id: f.id, publicId: f.publicId, key: f.key, name: f.name, daysPerWeek: f.daysPerWeek, courierDiscountPct: f.courierDiscountPct })),
    durations: durRows.map((d) => ({ id: d.id, publicId: d.publicId, weeks: d.weeks, discountPct: d.discountPct })),
    zones: zoneRows.map((z) => ({ id: z.id, publicId: z.publicId, name: z.name, postalPrefixes: z.postalPrefixes, slotWindow: z.slotWindow, active: z.active })),
    tiers: tierRows.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, upliftPct: Number(t.upliftPct) })),
    categoryLabels,
  };
}
