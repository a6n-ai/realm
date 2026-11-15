import { eq } from "drizzle-orm";
import { round2 } from "@foundry/commons/util/money";
import { db } from "@/db/client";
import { categoryCostRates, mealSizeItems, mealSizes } from "@/db/schema";
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

/** Food cost of one tiffin: the meal size's composition at the category cost rates, or its cost price override. */
async function foodPerTiffin(mealSizePublicId: string): Promise<number | null> {
  const [size] = await db
    .select({ id: mealSizes.id, planId: mealSizes.planId, costPrice: mealSizes.costPrice })
    .from(mealSizes)
    .where(eq(mealSizes.publicId, mealSizePublicId))
    .limit(1);
  if (!size) return null;
  if (size.costPrice != null) return Number(size.costPrice);
  const [items, rateRows] = await Promise.all([
    db
      .select({ category: mealSizeItems.category, planId: mealSizeItems.planId, tuAmount: mealSizeItems.tuAmount, sortOrder: mealSizeItems.sortOrder })
      .from(mealSizeItems)
      .where(eq(mealSizeItems.mealSizeId, size.id)),
    db
      .select({ category: categoryCostRates.category, planId: categoryCostRates.planId, organizationId: categoryCostRates.organizationId, costBase: categoryCostRates.costBase, costPerTu: categoryCostRates.costPerTu })
      .from(categoryCostRates)
      .where(eq(categoryCostRates.active, true)),
  ]);
  if (items.length === 0 || rateRows.length === 0) return null;
  const rates: CostRate[] = rateRows.map((r) => ({ ...r, costBase: Number(r.costBase), costPerTu: Number(r.costPerTu) }));
  // shortcut: global rates and no add-ons; quotes happen before an org or add-on cost is known, upgrade if franchises get own rates.
  const picks = deliveryPicks({ items, swaps: [], addons: [], orderPlanId: size.planId, categoriesByKey: new Map() });
  return tiffinFoodCost(picks, rates, null).cost;
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
