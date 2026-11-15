import { eq, inArray } from "drizzle-orm";
import { round2 } from "@foundry/commons/util/money";
import { db } from "@/db/client";
import { categoryCostRates, mealSizeItems, mealSizes, orders } from "@/db/schema";
import { tiffinFoodCost, type CostRate } from "@/lib/analytics/food-cost";
import { deliveryPicks } from "@/lib/analytics/food-cost.service";
import { getProfitabilityAssumptions } from "@/lib/analytics/profitability-settings";
import type { ProfitabilityAssumptions } from "@/lib/analytics/profitability";
import { mealCostFloor } from "@/lib/pricing/cost-floor";

export type OrderCosting = {
  /** Food + driver + other per-tiffin cost for the whole plan. */
  cost: number;
  /** Lowest pre-tax total allowed after discounts: cost grossed up by the minimum margin. */
  floor: number;
  /** Pre-tax total that keeps the target margin; discounts above it are not recommended. */
  target: number;
  targetMarginPct: number;
  minMarginPct: number;
};

function grossUp(cost: number, marginPct: number): number {
  return round2(cost / (1 - Math.min(marginPct, 95) / 100));
}

/** Food cost of one tiffin per meal size: its composition at the category cost rates, or its cost price override. Null = unknown. */
export async function foodPerTiffinByMealSize(where: { ids?: bigint[]; publicIds?: string[] }): Promise<Map<bigint, { publicId: string; food: number | null }>> {
  const out = new Map<bigint, { publicId: string; food: number | null }>();
  const filter = where.ids ? inArray(mealSizes.id, where.ids) : inArray(mealSizes.publicId, where.publicIds ?? []);
  if ((where.ids ?? where.publicIds ?? []).length === 0) return out;
  const sizes = await db.select({ id: mealSizes.id, publicId: mealSizes.publicId, planId: mealSizes.planId, costPrice: mealSizes.costPrice }).from(mealSizes).where(filter);
  if (sizes.length === 0) return out;
  const [items, rateRows] = await Promise.all([
    db
      .select({ mealSizeId: mealSizeItems.mealSizeId, category: mealSizeItems.category, planId: mealSizeItems.planId, tuAmount: mealSizeItems.tuAmount, sortOrder: mealSizeItems.sortOrder })
      .from(mealSizeItems)
      .where(inArray(mealSizeItems.mealSizeId, sizes.map((m) => m.id))),
    db
      .select({ category: categoryCostRates.category, planId: categoryCostRates.planId, organizationId: categoryCostRates.organizationId, costBase: categoryCostRates.costBase, costPerTu: categoryCostRates.costPerTu })
      .from(categoryCostRates)
      .where(eq(categoryCostRates.active, true)),
  ]);
  const rates: CostRate[] = rateRows.map((r) => ({ ...r, costBase: Number(r.costBase), costPerTu: Number(r.costPerTu) }));
  for (const size of sizes) {
    if (size.costPrice != null) {
      out.set(size.id, { publicId: size.publicId, food: Number(size.costPrice) });
      continue;
    }
    const own = items.filter((i) => i.mealSizeId === size.id);
    if (own.length === 0 || rates.length === 0) {
      out.set(size.id, { publicId: size.publicId, food: null });
      continue;
    }
    // shortcut: global rates and no add-ons; quotes happen before an org or add-on cost is known, upgrade if franchises get own rates.
    const picks = deliveryPicks({ items: own, swaps: [], addons: [], orderPlanId: size.planId, categoriesByKey: new Map() });
    out.set(size.id, { publicId: size.publicId, food: tiffinFoodCost(picks, rates, null).cost });
  }
  return out;
}

async function foodPerTiffin(mealSizePublicId: string): Promise<number | null> {
  const [hit] = (await foodPerTiffinByMealSize({ publicIds: [mealSizePublicId] })).values();
  return hit?.food ?? null;
}

/** Plan cost, the below-cost floor and the target-margin price for a quote. Null when no cost is known. */
export async function loadOrderCosting(mealSizePublicId: string, tiffinCount: number): Promise<OrderCosting | null> {
  const [food, a] = await Promise.all([foodPerTiffin(mealSizePublicId), getProfitabilityAssumptions()]);
  return food == null ? null : orderCosting(food, tiffinCount, a);
}

export function orderCosting(
  foodPerTiffin: number,
  tiffinCount: number,
  a: Pick<ProfitabilityAssumptions, "driverCostPerTiffin" | "otherCostPerTiffin" | "targetMarginPct" | "minMarginPct">,
): OrderCosting | null {
  const cost = mealCostFloor(foodPerTiffin + a.driverCostPerTiffin + a.otherCostPerTiffin, tiffinCount);
  if (cost == null) return null;
  return { cost, floor: grossUp(cost, a.minMarginPct), target: grossUp(cost, a.targetMarginPct), targetMarginPct: a.targetMarginPct, minMarginPct: a.minMarginPct };
}

/** Below-cost floor for the discount lane (cost grossed up by the minimum margin). Null when no cost is known. */
export async function loadMealCostFloor(mealSizePublicId: string, tiffinCount: number): Promise<number | null> {
  return (await loadOrderCosting(mealSizePublicId, tiffinCount))?.floor ?? null;
}

/** Plan cost (food + driver + other per tiffin × tiffins) for each order on a listing page. Null = no cost known. */
export async function planCostsForOrders(orderPublicIds: string[]): Promise<Record<string, number | null>> {
  if (orderPublicIds.length === 0) return {};
  const rows = await db
    .select({ publicId: orders.publicId, mealSizeId: orders.mealSizeId, tiffinCount: orders.tiffinCount })
    .from(orders)
    .where(inArray(orders.publicId, orderPublicIds));
  const [food, a] = await Promise.all([foodPerTiffinByMealSize({ ids: [...new Set(rows.map((r) => r.mealSizeId))] }), getProfitabilityAssumptions()]);
  return Object.fromEntries(
    rows.map((r) => {
      const f = food.get(r.mealSizeId)?.food;
      return [r.publicId, f == null ? null : (orderCosting(f, r.tiffinCount, a)?.cost ?? null)];
    }),
  );
}
