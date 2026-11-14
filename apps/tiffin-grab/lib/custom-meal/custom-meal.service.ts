import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ValidationError } from "@foundry/commons";
import { db, type Tx } from "@/db/client";
import { customMealPricing, dishCategories, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { resolveCompositionRows } from "../catalog/catalog.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { compositionName, mealPlanKey, normalizeItems, sizeCompositionKey, type CategoryUnit, type CustomMealItem } from "@/lib/custom-meal/composition";


/** Same item rows and category-on-plan rule as Catalog meal sizes (each item keeps its own plan). */
async function compositionRows(items: CustomMealItem[]) {
  try {
    return (await resolveCompositionRows(items.map((i) => ({ category: i.category, planId: i.planKey, tuAmount: i.tuAmount.toFixed(2) })))).rows;
  } catch (err) {
    if (err instanceof ValidationError) throw new ValidationError(`Custom meal: ${err.message}`);
    throw err;
  }
}

export async function loadCategoryUnits(q: Pick<typeof db, "select"> = db): Promise<Map<string, CategoryUnit>> {
  const rows = await q.select({
    key: dishCategories.key, label: dishCategories.label, tuUnitType: dishCategories.tuUnitType,
    tuUnitSize: dishCategories.tuUnitSize, tuUnitLabel: dishCategories.tuUnitLabel, weekend: dishCategories.weekend,
  }).from(dishCategories);
  return new Map(rows.map((r) => [r.key, { ...r, tuUnitSize: Number(r.tuUnitSize) }]));
}

// Lives in lib/custom-meal/pricing-rows.ts (not here) so lib/catalog/load.ts can
// import it without a cycle (this service imports invalidateCatalogSnapshot from load.ts).
export { loadPricingRows, type PricingRowView } from "@/lib/custom-meal/pricing-rows";

export type PricedComposition = { items: CustomMealItem[]; units: Map<string, CategoryUnit>; name: string; perTiffin: number };

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
  opts: { actorId: bigint | null; tx?: Tx; basePrice?: number; planKey?: string },
): Promise<{ id: bigint; publicId: string; name: string; created: boolean }> {
  const run = async (tx: Tx) => {
    const units = await loadCategoryUnits(tx);
    for (const i of rawItems) if (!units.has(i.category)) throw new ValidationError(`Unknown category: ${i.category}`);
    const items = normalizeItems(rawItems, units);
    if (!items.length) throw new ValidationError("A custom meal needs at least one item");
    const rows = await compositionRows(items);
    const mealPlan = opts.planKey ?? mealPlanKey(items);
    const key = sizeCompositionKey(items, mealPlan);

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
      planId: planId(mealPlan),
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
    await tx.insert(mealSizeItems).values(rows.map((r) => ({ ...r, mealSizeId: size.id, createdBy: opts.actorId, updatedBy: opts.actorId })));
    return { ...size, created: true };
  };
  if (opts.tx) return run(opts.tx);
  const result = await db.transaction(run);
  if (result.created) await invalidateCatalogSnapshot();
  return result;
}
