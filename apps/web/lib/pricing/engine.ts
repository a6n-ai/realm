import type { PricingCatalog, PricingLine, PricingResult, PricingSelections } from "./types";

export const STUDENT_DISCOUNT_PCT = 10;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function priceSubscription(selections: PricingSelections, catalog: PricingCatalog): PricingResult {
  const lineItems: PricingLine[] = [];
  const discounts: PricingLine[] = [];

  const slotCount = Math.max(1, selections.mealSlots.length);
  const mealsSubtotal = round2(
    catalog.mealSize.basePrice * catalog.frequency.daysPerWeek * selections.persons * slotCount,
  );
  lineItems.push({
    label: `Meals (${catalog.frequency.daysPerWeek}d × ${selections.persons}p × ${slotCount} slot${slotCount > 1 ? "s" : ""}/wk)`,
    amount: mealsSubtotal,
  });

  if (selections.includeSaturday) lineItems.push({ label: "Saturday Special", amount: round2(catalog.addons.saturday) });
  if (selections.includeSunday) lineItems.push({ label: "Sunday Classics", amount: round2(catalog.addons.sunday) });

  const addonsSubtotal =
    (selections.includeSaturday ? catalog.addons.saturday : 0) +
    (selections.includeSunday ? catalog.addons.sunday : 0);

  // Courier discount applies to the weekday meal subtotal only (not weekend add-ons).
  const courierDiscount = round2(mealsSubtotal * (catalog.frequency.courierDiscountPct / 100));
  if (courierDiscount > 0) discounts.push({ label: "Courier discount (MWF)", amount: courierDiscount });

  let running = round2(mealsSubtotal + addonsSubtotal - courierDiscount);

  const studentPct = selections.isStudent ? STUDENT_DISCOUNT_PCT : 0;
  const studentDiscount = round2(running * (studentPct / 100));
  if (studentDiscount > 0) discounts.push({ label: "Student discount", amount: studentDiscount });
  running = round2(running - studentDiscount);

  const durationPct = catalog.durationPackage.discountPct;
  const durationDiscount = round2(running * (durationPct / 100));
  if (durationDiscount > 0) discounts.push({ label: `Loyalty discount (${durationPct}%)`, amount: durationDiscount });

  const weeklyFee = round2(running - durationDiscount);
  const total = round2(weeklyFee * selections.durationWeeks);

  return { lineItems, discounts, weeklyFee, durationWeeks: selections.durationWeeks, total };
}
