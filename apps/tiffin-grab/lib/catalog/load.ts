import { and, eq, isNull, lte, gte, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { sharedCache } from "@/lib/cache";
import {
  addressTags,
  deliveryChargeConfigs,
  deliveryFrequencies,
  deliveryStrategies,
  deliveryZones,
  discounts,
  dishCategories,
  durationPackages,
  mealSizeItems,
  mealSizes,
  plans,
  pricingTiers,
} from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { formatTuHuman } from "@/lib/menu/format-tu";
import { getAppSettings } from "@/lib/services/app-settings.service";
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

export function scopedTo(column: AnyPgColumn, orgId: string | null | undefined): SQL | undefined {
  return orgId ? or(isNull(column), eq(column, orgId)) : undefined;
}

async function fetchCatalogSnapshot(orgId?: string | null): Promise<CatalogSnapshot> {
  const nowMs = Date.now();
  const [
    planRows,
    mealRows,
    itemRows,
    freqRows,
    durRows,
    zoneRows,
    tierRows,
    tiffinSlots,
    healthySlots,
    categoryRows,
    addonsByCategory,
    settings,
    discountRows,
    configRows,
    strategyRows,
    tagRows,
  ] = await Promise.all([
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
    dishCategoriesService.addonsByDishCategory(),
    getAppSettings(),
    db.select().from(discounts).where(and(eq(discounts.active, true), scopedTo(discounts.organizationId, orgId), or(isNull(discounts.startsAt), lte(discounts.startsAt, nowMs)), or(isNull(discounts.endsAt), gte(discounts.endsAt, nowMs)))),
    db.select().from(deliveryChargeConfigs).where(scopedTo(deliveryChargeConfigs.organizationId, orgId)).limit(1),
    db.select().from(deliveryStrategies).where(and(eq(deliveryStrategies.active, true), scopedTo(deliveryStrategies.organizationId, orgId))).orderBy(deliveryStrategies.sortOrder, deliveryStrategies.name),
    db.select().from(addressTags).where(and(eq(addressTags.active, true), scopedTo(addressTags.organizationId, orgId))).orderBy(addressTags.sortOrder, addressTags.name),
  ]);
  const publicIdByTarget = new Map<string, string>([
    ...freqRows.map((f) => [`delivery:${f.id}`, f.publicId] as [string, string]),
    ...durRows.map((d) => [`duration:${d.id}`, d.publicId] as [string, string]),
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
    frequencies: freqRows.map((f) => ({ id: f.id, publicId: f.publicId, key: f.key, name: f.name, daysPerWeek: f.daysPerWeek, courierDiscountPct: f.courierDiscountPct, weekdays: f.weekdays })),
    durations: durRows.map((d) => ({ id: d.id, publicId: d.publicId, weeks: d.weeks, discountPct: d.discountPct })),
    zones: zoneRows.map((z) => ({ id: z.id, publicId: z.publicId, name: z.name, radiusKm: z.radiusKm == null ? null : Number(z.radiusKm), postalPrefixes: z.postalPrefixes, slotWindow: z.slotWindow, active: z.active })),
    tiers: tierRows.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, upliftPct: Number(t.upliftPct) })),
    categoryLabels,
    addonsByCategory: Object.fromEntries(addonsByCategory),
    minTiffinsPerWeek: settings.minTiffinsPerWeek,
    maxTiffinsPerWeek: settings.maxTiffinsPerWeek,
    // A row whose target is inactive/missing is dropped rather than widened to "all".
    discounts: discountRows.flatMap((d) => {
      const targetPublicId = d.targetId == null ? null : publicIdByTarget.get(`${d.kind}:${d.targetId}`) ?? undefined;
      return targetPublicId === undefined ? [] : [{ key: d.key, name: d.name, kind: d.kind, targetPublicId, percent: Number(d.percent), minWeeks: d.minWeeks }];
    }),
    maxDiscountPct: settings.maxDiscountPct,
    deliveryCharges: {
      baseCharge: configRows[0] ? Number(configRows[0].baseCharge) : 0,
      deliveryStrategies: strategyRows.map((s) => ({
        id: s.id,
        publicId: s.publicId,
        name: s.name,
        description: s.description,
        chargeType: s.chargeType,
        chargeValue: Number(s.chargeValue),
        active: s.active,
        sortOrder: s.sortOrder,
      })),
      addressTags: tagRows.map((a) => ({
        id: a.id,
        publicId: a.publicId,
        name: a.name,
        description: a.description,
        chargeType: a.chargeType,
        chargeValue: Number(a.chargeValue),
        active: a.active,
        sortOrder: a.sortOrder,
      })),
    },
  };
}

// Re-price path only (changeMealSize): the order's own frequency/duration may be retired, so the
// snapshot's active-only target map would silently drop discounts aimed at them. Not used by checkout.
export async function loadDiscountsForOrderTargets(
  orgId: string | null | undefined,
  targets: { frequency: { id: bigint; publicId: string }; duration: { id: bigint; publicId: string } },
): Promise<CatalogSnapshot["discounts"]> {
  const nowMs = Date.now();
  const rows = await db.select().from(discounts).where(and(
    eq(discounts.active, true), scopedTo(discounts.organizationId, orgId),
    or(isNull(discounts.startsAt), lte(discounts.startsAt, nowMs)), or(isNull(discounts.endsAt), gte(discounts.endsAt, nowMs)),
  ));
  return (rows.flatMap((d) => {
    let targetPublicId: string | null;
    if (d.targetId == null) targetPublicId = null;
    else if (d.kind === "delivery" && d.targetId === targets.frequency.id) targetPublicId = targets.frequency.publicId;
    else if (d.kind === "duration" && d.targetId === targets.duration.id) targetPublicId = targets.duration.publicId;
    else return [];
    return [{ key: d.key, name: d.name, kind: d.kind, targetPublicId, percent: Number(d.percent), minWeeks: d.minWeeks }];
  })) as NonNullable<CatalogSnapshot["discounts"]>;
}
