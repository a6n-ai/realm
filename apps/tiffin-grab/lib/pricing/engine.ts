import type { TaxLine } from "@foundry/payments";
import { resolveCatalogDiscounts } from "@foundry/discounts";
import type { PricingCatalog, PricingLine, PricingResult, PricingSelections } from "./types";
import { calculateDeliveryCharge, type DeliveryChargeCalculationResult } from "@foundry/delivery";
import { deliveryWaiverLines, taxWaiverLine } from "./waivers";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function priceSubscription(
  selections: PricingSelections,
  catalog: PricingCatalog,
  adjustments: PricingLine[] = [],
  taxes: TaxLine[] = [],
): PricingResult {
  const deliveryDays = selections.eatingDays
    ? selections.eatingDays.length
    : catalog.frequency.daysPerWeek +
      (selections.includeSaturday ? 1 : 0) +
      (selections.includeSunday ? 1 : 0);

  // Slot-agnostic: one tiffin per delivery day per person, regardless of slot count.
  const tiffinCount = deliveryDays * selections.durationWeeks * selections.persons;

  const perTiffinPrice = round2(catalog.mealSize.basePrice);
  const tiffinSubtotal = round2(perTiffinPrice * tiffinCount);

  const lineItems: PricingLine[] = [
    { label: `Tiffins (${tiffinCount} × $${perTiffinPrice.toFixed(2)})`, amount: tiffinSubtotal },
  ];

  // Each add-on qty rides in every tiffin, so it bills per tiffin like the meal.
  let addonSubtotal = 0;
  for (const addon of catalog.addons) {
    const amount = round2(addon.pricePerTiffin * addon.qty * tiffinCount);
    addonSubtotal += amount;
    const qtyLabel = addon.qty > 1 ? ` ×${addon.qty}` : "";
    lineItems.push({ label: `${addon.name}${qtyLabel} (add-on, ${tiffinCount} × $${addon.pricePerTiffin.toFixed(2)})`, amount });
  }
  addonSubtotal = round2(addonSubtotal);

  let deliveryCalc: DeliveryChargeCalculationResult | undefined = undefined;
  let deliveryTotal = 0;
  if (catalog.deliveryChargeConfig) {
    deliveryCalc = calculateDeliveryCharge({
      baseCharge: catalog.deliveryChargeConfig.baseCharge,
      deliveryStrategies: catalog.deliveryChargeConfig.deliveryStrategies,
      deliveryCount: catalog.deliveryChargeConfig.deliveryCount,
      addressTag: catalog.deliveryChargeConfig.addressTag,
      planPrice: tiffinSubtotal,
    });
    deliveryTotal = deliveryCalc.totalDeliveryCharge;
    for (const line of deliveryCalc.lines) {
      lineItems.push(line);
    }
  }

  const subtotal = round2(tiffinSubtotal + addonSubtotal + deliveryTotal);

  const labels = new Map((catalog.discounts ?? []).map((d) => [d.key, d.label]));
  const cadenceDiscount: PricingLine[] = resolveCatalogDiscounts(
    (catalog.discounts ?? []).map((d) => ({ key: d.key, name: d.label, kind: "", percent: d.percent })),
    { subtotal: tiffinSubtotal, maxDiscountPct: catalog.maxDiscountPct ?? 25 },
  ).lines.map((l) => ({ label: labels.get(l.key)!, amount: l.amount, discountKey: l.key }));
  const allAdjustments = [...adjustments, ...cadenceDiscount, ...deliveryWaiverLines(deliveryCalc, catalog.waivers ?? [])];

  // Coupon hook: resolved discount lines (positive magnitudes) are subtracted; base floored at 0.
  let taxableBase = Math.max(0, round2(subtotal - allAdjustments.reduce((s, a) => s + a.amount, 0)));
  const taxWaiver = taxWaiverLine(taxableBase, taxes, catalog.waivers ?? []);
  if (taxWaiver) {
    allAdjustments.push(taxWaiver);
    taxableBase = round2(taxableBase - taxWaiver.amount);
  }

  // Per-method taxes apply to the discounted base; taxTotal is summed from per-line rounding so
  // it always matches the printed receipt. No taxes ⇒ taxTotal 0 ⇒ total == taxableBase. This
  // mirrors @foundry/payments `computeTax` (the canonical server-side implementation); kept inline
  // here so the client-bundled pricing engine takes no runtime dependency on that package.
  const taxLines = taxes.map((t) => ({
    name: t.name,
    ratePct: t.ratePct,
    amount: round2(taxableBase * (t.ratePct / 100)),
  }));
  const taxTotal = round2(taxLines.reduce((s, l) => s + l.amount, 0));
  const total = round2(taxableBase + taxTotal);

  return {
    lineItems,
    adjustments: allAdjustments,
    taxLines,
    taxTotal,
    tiffinCount,
    deliveryCount: catalog.deliveryCount,
    perTiffinPrice,
    subtotal,
    total,
    deliveryCharge: deliveryCalc,
  };
}
