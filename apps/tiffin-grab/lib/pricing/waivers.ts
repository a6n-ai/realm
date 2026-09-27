import type { TaxLine } from "@foundry/payments";
import type { DeliveryChargeCalculationResult } from "@foundry/delivery";
import type { WaiverKind } from "@/lib/catalog/types";
import type { PricingLine } from "./types";

export interface PricingWaiver {
  key: string;
  /** Customer-facing line label; blank falls back to a generic one. */
  name?: string;
  kind: WaiverKind;
  /** Strategy publicId for waiver_strategy, else null. */
  strategyId: string | null;
  percent: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const pctOf = (w: PricingWaiver) => Math.min(100, Math.max(0, w.percent));
const withPct = (label: string, pct: number) => (pct < 100 ? `${label} (${pct}%)` : label);

// Each fee component is waived by its single strongest matching waiver, so overlapping
// waivers (all fees + base) never waive more than the fee itself.
export function deliveryWaiverLines(calc: DeliveryChargeCalculationResult | undefined, waivers: PricingWaiver[]): PricingLine[] {
  if (!calc) return [];
  const fees = waivers.filter((w) => w.kind !== "waiver_tax" && pctOf(w) > 0);
  if (fees.length === 0) return [];
  const components: { amount: number; name: string; matches: (w: PricingWaiver) => boolean }[] = [
    { amount: calc.baseAmount, name: "Base delivery charge", matches: (w) => w.kind === "waiver_delivery" || w.kind === "waiver_base" },
    ...calc.deliveryStrategies.map((s) => ({
      amount: s.amount,
      name: s.name,
      matches: (w: PricingWaiver) => w.kind === "waiver_delivery" || (w.kind === "waiver_strategy" && w.strategyId === s.id),
    })),
    ...(calc.addressTag ? [{ amount: calc.addressTag.amount, name: calc.addressTag.name, matches: (w: PricingWaiver) => w.kind === "waiver_delivery" }] : []),
  ];
  const byKey = new Map<string, { waiver: PricingWaiver; amount: number; names: string[] }>();
  for (const c of components) {
    if (c.amount <= 0) continue;
    const best = fees.filter(c.matches).sort((a, b) => pctOf(b) - pctOf(a))[0];
    if (!best) continue;
    const hit = byKey.get(best.key) ?? { waiver: best, amount: 0, names: [] };
    hit.amount = round2(hit.amount + c.amount * (pctOf(best) / 100));
    hit.names.push(c.name);
    byKey.set(best.key, hit);
  }
  return [...byKey.values()].filter((h) => h.amount > 0).map(({ waiver, amount, names }) => ({
    label: withPct(
      waiver.name?.trim() ||
        (waiver.kind === "waiver_delivery" ? "Delivery fees waived"
          : waiver.kind === "waiver_base" ? "Base delivery charge waived"
          : `${names[0]} fee waived`),
      pctOf(waiver),
    ),
    amount,
    discountKey: waiver.key,
  }));
}

const taxOn = (base: number, taxes: TaxLine[]) => taxes.reduce((s, t) => s + round2(base * (t.ratePct / 100)), 0);

// "We pay the tax": tax can't be dropped from a taxable sale, so the price is lowered instead
// until price + tax lands at (or a cent under) what the customer would pay without the waived
// share of tax. The receipt still shows the tax on the lowered price.
export function taxWaiverLine(taxableBase: number, taxes: TaxLine[], waivers: PricingWaiver[]): PricingLine | null {
  const waiver = waivers.filter((w) => w.kind === "waiver_tax" && pctOf(w) > 0).sort((a, b) => pctOf(b) - pctOf(a))[0];
  const rate = taxes.reduce((s, t) => s + t.ratePct, 0) / 100;
  if (!waiver || rate <= 0 || taxableBase <= 0) return null;
  const pct = pctOf(waiver) / 100;
  const target = round2(taxableBase + taxOn(taxableBase, taxes) * (1 - pct));
  let base = round2(target / (1 + rate));
  // Per-line rounding can leave price + tax a cent over the target; step down until it isn't.
  while (base > 0 && round2(base + taxOn(base, taxes)) > target) base = round2(base - 0.01);
  const amount = round2(taxableBase - base);
  return amount > 0 ? { label: withPct(waiver.name?.trim() || "Tax covered by us", pctOf(waiver)), amount, discountKey: waiver.key } : null;
}
