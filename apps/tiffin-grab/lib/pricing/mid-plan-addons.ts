import type { OrderPricingSnapshot } from "./types";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type MidPlanAddon = { name: string; pricePerTiffin: number; qty: number };

export type MidPlanAddonPricing = {
  snapshot: OrderPricingSnapshot;
  lines: { label: string; amount: number }[];
  addonSubtotal: number;
  taxTotal: number;
  amountDue: number;
};

/**
 * Add-ons bought after checkout, billed for the tiffins still open. A delta on the stored
 * receipt, never a priceSubscription rerun: the meal keeps the price and discount it was sold
 * at even if the catalog has changed since. Add-ons take no plan discount, same as checkout.
 * Tax is worked out on the add-on amount alone, so what is collected now is exactly
 * amountDue and the earlier payment's tax is left as it was charged.
 */
export function addAddonsToSnapshot(
  snapshot: OrderPricingSnapshot,
  addons: MidPlanAddon[],
  openTiffins: number,
  taxes: { name: string; ratePct: number }[],
): MidPlanAddonPricing {
  const lines = addons.map((a) => ({
    // Same wording as the engine's checkout add-on line.
    label: `${a.name}${a.qty > 1 ? ` ×${a.qty}` : ""} (add-on, ${openTiffins} × $${a.pricePerTiffin.toFixed(2)})`,
    amount: round2(a.pricePerTiffin * a.qty * openTiffins),
  }));
  const addonSubtotal = round2(lines.reduce((s, l) => s + l.amount, 0));

  const taxLines = snapshot.taxLines.map((t) => ({ ...t }));
  let taxTotal = 0;
  for (const t of taxes) {
    const amount = round2(addonSubtotal * (t.ratePct / 100));
    taxTotal = round2(taxTotal + amount);
    const existing = taxLines.find((l) => l.name === t.name && l.ratePct === t.ratePct);
    if (existing) existing.amount = round2(existing.amount + amount);
    else taxLines.push({ name: t.name, ratePct: t.ratePct, amount });
  }

  const amountDue = round2(addonSubtotal + taxTotal);
  return {
    lines,
    addonSubtotal,
    taxTotal,
    amountDue,
    snapshot: {
      ...snapshot,
      lineItems: [...snapshot.lineItems, ...lines],
      subtotal: round2(snapshot.subtotal + addonSubtotal),
      taxLines,
      taxTotal: round2(snapshot.taxTotal + taxTotal),
      total: round2(snapshot.total + amountDue),
    },
  };
}
