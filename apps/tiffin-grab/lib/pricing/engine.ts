import type { TaxLine } from "@realm/payments";
import { assertValidTiers, findTier } from "./tiers";
import type { PricingCatalog, PricingLine, PricingResult, PricingSelections } from "./types";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function priceSubscription(
  selections: PricingSelections,
  catalog: PricingCatalog,
  adjustments: PricingLine[] = [],
  taxes: TaxLine[] = [],
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

  // Coupon hook: resolved discount lines (positive magnitudes) are subtracted; base floored at 0.
  const taxableBase = Math.max(0, round2(subtotal - adjustments.reduce((s, a) => s + a.amount, 0)));

  // Per-method taxes apply to the discounted base; taxTotal is summed from per-line rounding so
  // it always matches the printed receipt. No taxes ⇒ taxTotal 0 ⇒ total == taxableBase. This
  // mirrors @realm/payments `computeTax` (the canonical server-side implementation); kept inline
  // here so the client-bundled pricing engine takes no runtime dependency on that package.
  const taxLines = taxes.map((t) => ({
    name: t.name,
    ratePct: t.ratePct,
    amount: round2(taxableBase * (t.ratePct / 100)),
  }));
  const taxTotal = round2(taxLines.reduce((s, l) => s + l.amount, 0));
  const total = round2(taxableBase + taxTotal);

  return { lineItems, adjustments, taxLines, taxTotal, tiffinCount, perTiffinPrice, tier, subtotal, total };
}
