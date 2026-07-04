import { assertValidTiers, findTier } from "./tiers";
import type { PricingCatalog, PricingLine, PricingResult, PricingSelections } from "./types";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function priceSubscription(
  selections: PricingSelections,
  catalog: PricingCatalog,
  adjustments: PricingLine[] = [],
): PricingResult {
  assertValidTiers(catalog.tiers);

  const deliveryDays =
    catalog.frequency.daysPerWeek +
    (selections.includeSaturday ? 1 : 0) +
    (selections.includeSunday ? 1 : 0);

  // Slot-agnostic: one tiffin per delivery day per person, regardless of slot count.
  const tiffinCount = deliveryDays * selections.durationWeeks * selections.persons;

  const tier = findTier(catalog.tiers, tiffinCount);
  const perTiffinPrice = round2(catalog.mealSize.basePrice * (1 + tier.upliftPct / 100));
  const subtotal = round2(perTiffinPrice * tiffinCount);

  const lineItems: PricingLine[] = [
    { label: `Tiffins (${tiffinCount} × $${perTiffinPrice.toFixed(2)})`, amount: subtotal },
  ];

  // Coupon hook: resolved discount lines (positive magnitudes) are subtracted; total floored at 0.
  const total = Math.max(0, round2(subtotal - adjustments.reduce((s, a) => s + a.amount, 0)));

  return { lineItems, adjustments, tiffinCount, perTiffinPrice, tier, subtotal, total };
}
