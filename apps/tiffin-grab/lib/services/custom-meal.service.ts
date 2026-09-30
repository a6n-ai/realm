import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { customMealPricing, dishCategories, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import type { CatalogSnapshot, MealSizeView } from "@/lib/catalog/types";
import { compositionKey, compositionName, mealPlanKey, normalizeItems, type CategoryUnit, type CustomMealItem } from "@/lib/custom-meal/composition";
import { computeCustomPerTiffin, round2 } from "@/lib/custom-meal/pricing";
import { loadPricingRows } from "@/lib/custom-meal/pricing-rows";
import { formatTuHuman } from "@/lib/menu/format-tu";

// Item diets a custom meal can use; the healthy plan has no custom meals.
export const CUSTOM_MEAL_DIETS = ["veg", "non-veg"] as const;

export const customMealItemsSchema = z.array(z.object({
  category: z.string().trim().min(1),
  planKey: z.enum(CUSTOM_MEAL_DIETS),
  tuAmount: z.number().finite().positive().max(50),
})).min(1).max(20);

export const customMealSchema = z.object({
  items: customMealItemsSchema,
  basePriceOverride: z.number().finite().positive().max(1000).nullable().optional(),
});

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function loadCategoryUnits(q: Pick<typeof db, "select"> = db): Promise<Map<string, CategoryUnit>> {
  const rows = await q.select({
    key: dishCategories.key, label: dishCategories.label, tuUnitType: dishCategories.tuUnitType,
    tuUnitSize: dishCategories.tuUnitSize, tuUnitLabel: dishCategories.tuUnitLabel,
  }).from(dishCategories);
  return new Map(rows.map((r) => [r.key, { ...r, tuUnitSize: Number(r.tuUnitSize) }]));
}

// Lives in lib/custom-meal/pricing-rows.ts (not here) so lib/catalog/load.ts can
// import it without a cycle (this service imports invalidateCatalogSnapshot from load.ts).
export { loadPricingRows, type PricingRowView } from "@/lib/custom-meal/pricing-rows";

export type PricedComposition = { items: CustomMealItem[]; units: Map<string, CategoryUnit>; name: string; perTiffin: number };

// Staff-facing: names the exact category/diet to fix in Catalog → Custom Meals,
// unlike buildPricingCatalog's customer-facing "no longer available".
// A staff override stands in for missing pricing rows, so it is the per-tiffin price then.
export async function priceCustomComposition(
  rawItems: CustomMealItem[],
  basePriceOverride?: number | null,
): Promise<PricedComposition> {
  const [units, pricing] = await Promise.all([loadCategoryUnits(), loadPricingRows()]);
  for (const i of rawItems) if (!units.has(i.category)) throw new ValidationError(`Unknown category: ${i.category}`);
  const items = normalizeItems(rawItems, units);
  const active = pricing.filter((p) => p.active);
  const unpriced = items.find((i) => !active.some((p) => p.category === i.category && p.planKey === i.planKey));
  if (unpriced && basePriceOverride != null) {
    return { items, units, name: compositionName(items, units), perTiffin: round2(basePriceOverride) };
  }
  if (unpriced) {
    const diet = unpriced.planKey === "non-veg" ? "Non-Veg" : "Veg";
    throw new ValidationError(`Custom meal: ${units.get(unpriced.category)!.label} isn't priced for ${diet} — set it in Catalog → Custom Meals`);
  }
  try {
    return { items, units, name: compositionName(items, units), perTiffin: computeCustomPerTiffin(items, active) };
  } catch (err) {
    if (err instanceof ValidationError) throw new ValidationError(`Custom meal: ${err.message}`);
    throw err;
  }
}

export const TRANSIENT_CUSTOM_SIZE_ID = "custom-preview";

// A preview-only custom size: same shape load.ts gives a persisted one, so the
// normal buildPricingCatalog/priceSubscription path prices it without a DB write.
export function withTransientCustomSize(snapshot: CatalogSnapshot, priced: PricedComposition): CatalogSnapshot {
  const planKey = mealPlanKey(priced.items);
  const plan = snapshot.plans.find((p) => p.key === planKey);
  if (!plan) throw new ValidationError(`Unknown plan: ${planKey}`);
  const view: MealSizeView = {
    id: -1n, publicId: TRANSIENT_CUSTOM_SIZE_ID, key: TRANSIENT_CUSTOM_SIZE_ID, name: priced.name, description: null,
    planId: plan.id, planKey, tier: "budget",
    components: priced.items.map((i) => priced.units.get(i.category)!.label),
    items: priced.items.map((i) => {
      const unit = priced.units.get(i.category)!;
      return { name: unit.label, category: i.category, tuAmount: i.tuAmount, maxTuAmount: null, portion: formatTuHuman(unit, i.tuAmount) };
    }),
    kcalMin: 0, kcalMax: 0, proteinG: null, carbsG: null, fatG: null,
    basePrice: priced.perTiffin, discountType: "none", discountValue: 0, trial: false,
    custom: true, priceable: true,
  };
  return { ...snapshot, mealSizes: [...snapshot.mealSizes, view] };
}

export async function upsertPricing(
  input: { categoryKey: string; planKey: string; pricePerTu: number; maxTu: number | null; active: boolean },
  actorId: bigint | null,
): Promise<void> {
  const [cat] = await db.select({ id: dishCategories.id }).from(dishCategories).where(eq(dishCategories.key, input.categoryKey)).limit(1);
  const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, input.planKey)).limit(1);
  if (!cat || !plan) throw new ValidationError("Unknown category or plan");
  const values = {
    pricePerTu: input.pricePerTu.toFixed(2),
    maxTu: input.maxTu == null ? null : input.maxTu.toFixed(2),
    active: input.active,
    updatedAt: Date.now(),
    updatedBy: actorId,
  };
  await db.insert(customMealPricing)
    .values({ categoryId: cat.id, planId: plan.id, createdBy: actorId, ...values })
    .onConflictDoUpdate({ target: [customMealPricing.categoryId, customMealPricing.planId], set: values });
  await invalidateCatalogSnapshot();
}

export async function findOrCreateCustomMealSize(
  rawItems: CustomMealItem[],
  opts: { actorId: bigint | null; tx?: DbTx; basePrice?: number },
): Promise<{ id: bigint; publicId: string; name: string; created: boolean }> {
  const run = async (tx: DbTx) => {
    const units = await loadCategoryUnits(tx);
    for (const i of rawItems) if (!units.has(i.category)) throw new ValidationError(`Unknown category: ${i.category}`);
    const items = normalizeItems(rawItems, units);
    if (!items.length) throw new ValidationError("A custom meal needs at least one item");
    const key = compositionKey(items);

    const findExisting = async () => {
      const [row] = await tx.select({ id: mealSizes.id, publicId: mealSizes.publicId, name: mealSizes.name })
        .from(mealSizes).where(and(eq(mealSizes.custom, true), eq(mealSizes.compositionKey, key))).limit(1);
      return row;
    };
    const existing = await findExisting();
    if (existing) return { ...existing, created: false };

    const planRows = await tx.select({ id: plans.id, key: plans.key }).from(plans);
    const planId = (k: string) => {
      const p = planRows.find((r) => r.key === k);
      if (!p) throw new ValidationError(`Unknown plan: ${k}`);
      return p.id;
    };
    const name = compositionName(items, units);
    const [size] = await tx.insert(mealSizes).values({
      key: `custom_${createHash("sha1").update(key).digest("hex").slice(0, 12)}`,
      name,
      planId: planId(mealPlanKey(items)),
      tier: "budget",
      kcalMin: 0,
      kcalMax: 0,
      basePrice: (opts.basePrice ?? 0).toFixed(2),
      custom: true,
      compositionKey: key,
      createdBy: opts.actorId,
      updatedBy: opts.actorId,
    }).onConflictDoNothing().returning({ id: mealSizes.id, publicId: mealSizes.publicId, name: mealSizes.name });
    if (!size) {
      // A concurrent creator won the insert; under READ COMMITTED our conflicting
      // insert waited for its commit, so the re-select sees its row.
      const winner = await findExisting();
      if (!winner) throw new Error(`Custom meal size insert conflicted but no custom row has composition ${key}`);
      return { ...winner, created: false };
    }
    await tx.insert(mealSizeItems).values(items.map((i, idx) => ({
      mealSizeId: size.id,
      name: units.get(i.category)!.label,
      category: i.category,
      planId: planId(i.planKey),
      tuAmount: i.tuAmount.toFixed(2),
      sortOrder: idx,
      createdBy: opts.actorId,
      updatedBy: opts.actorId,
    })));
    return { ...size, created: true };
  };
  if (opts.tx) return run(opts.tx);
  const result = await db.transaction(run);
  if (result.created) await invalidateCatalogSnapshot();
  return result;
}
