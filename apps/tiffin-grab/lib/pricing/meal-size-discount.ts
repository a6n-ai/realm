export type MealSizeDiscount = { discountType: "none" | "percent" | "flat"; discountValue: number };

/** A `meal_size` row from the central discounts table. targetId null = every meal size. */
export type MealSizeDiscountRow = { targetId: bigint | null; percent: number; amount: number | null };

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// The one place "list price -> effective price" is computed. Both the pricing engine (via
// buildPricingCatalog) and every customer-facing meal-size card import this — never duplicate
// the percent/flat branch elsewhere. "none" is the off-switch; discountValue is ignored then.
export function effectivePrice(basePrice: number, discount: MealSizeDiscount): number {
  if (discount.discountType === "percent") return Math.max(0, round2(basePrice * (1 - discount.discountValue / 100)));
  if (discount.discountType === "flat") return Math.max(0, round2(basePrice - discount.discountValue));
  return basePrice;
}

// List-price rows don't stack: a row aimed at this size beats an "all sizes" row, and among
// equals the one leaving the lower price wins.
export function mealSizeDiscountFor(mealSizeId: bigint, basePrice: number, rows: MealSizeDiscountRow[]): MealSizeDiscount {
  const asDiscount = (r: MealSizeDiscountRow): MealSizeDiscount =>
    r.amount != null && r.amount > 0 ? { discountType: "flat", discountValue: r.amount } : { discountType: "percent", discountValue: r.percent };
  const pick = (candidates: MealSizeDiscountRow[]) =>
    candidates
      .map(asDiscount)
      .filter((d) => d.discountValue > 0)
      .sort((a, b) => effectivePrice(basePrice, a) - effectivePrice(basePrice, b))[0];
  return pick(rows.filter((r) => r.targetId === mealSizeId)) ?? pick(rows.filter((r) => r.targetId == null)) ?? { discountType: "none", discountValue: 0 };
}
