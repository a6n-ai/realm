import { round2 } from "@foundry/commons/util/money";

/** Kitchen COGS for the whole plan: cost per tiffin × tiffin count. Null when cost is unset. */
export function mealCostFloor(costPrice: number | null | undefined, tiffinCount: number): number | null {
  if (costPrice == null || !Number.isFinite(costPrice) || costPrice < 0 || tiffinCount <= 0) return null;
  return round2(costPrice * tiffinCount);
}

/** Largest coupon/staff discount that still leaves post-catalog at or above the cost floor. */
export function maxDiscountAboveCost(postCatalog: number, costFloor: number | null | undefined): number | null {
  if (costFloor == null) return null;
  return Math.max(0, round2(postCatalog - costFloor));
}

export const BELOW_COST_ERROR = "This discount would sell below cost";
