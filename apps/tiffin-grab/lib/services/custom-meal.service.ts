import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { customMealPricing, dishCategories, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { compositionKey, compositionName, mealPlanKey, normalizeItems, type CategoryUnit, type CustomMealItem } from "@/lib/custom-meal/composition";

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

    const [existing] = await tx.select({ id: mealSizes.id, publicId: mealSizes.publicId, name: mealSizes.name })
      .from(mealSizes).where(and(eq(mealSizes.custom, true), eq(mealSizes.compositionKey, key))).limit(1);
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
    }).returning({ id: mealSizes.id, publicId: mealSizes.publicId, name: mealSizes.name });
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
