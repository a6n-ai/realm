export type MealSizeDiscount = { discountType: "none" | "percent" | "flat"; discountValue: number };

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// The one place "list price -> effective price" is computed. Both the pricing engine (via
// buildPricingCatalog) and every customer-facing meal-size card import this — never duplicate
// the percent/flat branch elsewhere. "none" is the off-switch; discountValue is ignored then.
export function effectivePrice(basePrice: number, discount: MealSizeDiscount): number {
  if (discount.discountType === "percent") return Math.max(0, round2(basePrice * (1 - discount.discountValue / 100)));
  if (discount.discountType === "flat") return Math.max(0, round2(basePrice - discount.discountValue));
  return basePrice;
}
