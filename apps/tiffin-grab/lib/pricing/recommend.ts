import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";
import { buildPricingCatalog } from "./build-catalog";
import { priceSubscription } from "./engine";
import type { PricingSelections } from "./types";

export interface Deal<T> {
  id: string;
  label: string;
  payload: T;
  perUnit: number;
  savingPerUnit: number;
  savingPct: number;
  totalDelta: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Same signature/semantics as @foundry/discounts `rankDeals` so it can be swapped in later.
export function rankDeals<T>(
  current: { total: number; units: number },
  alternatives: { id: string; label: string; total: number; units: number; payload: T }[],
  opts: { limit?: number; minSavingPct?: number } = {},
): Deal<T>[] {
  if (current.total <= 0 || current.units <= 0) return [];
  const { limit = 3, minSavingPct = 1 } = opts;
  const curPer = current.total / current.units;
  return alternatives
    .filter((a) => a.units > 0)
    .map((a) => {
      const perUnit = a.total / a.units;
      return {
        id: a.id,
        label: a.label,
        payload: a.payload,
        perUnit: round2(perUnit),
        savingPerUnit: round2(curPer - perUnit),
        savingPct: ((curPer - perUnit) / curPer) * 100,
        totalDelta: round2(a.total - current.total),
      };
    })
    .filter((d) => d.savingPct > 0 && d.savingPct >= minSavingPct)
    .sort((a, b) => b.savingPct - a.savingPct)
    .slice(0, limit);
}

export interface DealPayload {
  frequencyKey: string;
  durationWeeks: number;
  tiffinCount: number;
  total: number;
  includes: { name: string; percent: number }[];
  tierMinQty: number;
  tierChanged: boolean;
}

const price = (snapshot: ClientCatalogSnapshot, s: PricingSelections) => {
  try {
    const r = priceSubscription(s, buildPricingCatalog(snapshot as never, s));
    return { total: r.total, units: r.tiffinCount, adjustments: r.adjustments, tierMinQty: r.tier.minQty };
  } catch {
    return null;
  }
};

export function recommendDeals({ snapshot, selections, cap = 1, vary }: { snapshot: ClientCatalogSnapshot; selections: PricingSelections; cap?: number; vary?: "frequency" | "duration" }): Deal<DealPayload>[] {
  const eating = (selections.eatingDays ?? []) as DayOfWeek[];
  const current = price(snapshot, selections);
  if (!current) return [];
  const alternatives: Parameters<typeof rankDeals<DealPayload>>[1] = [];
  for (const f of snapshot.frequencies) {
    if (!f.weekdays?.length) continue;
    if (planWeek(f.weekdays as DayOfWeek[], eating) === null) continue;
    if (vary === "duration" && f.key !== selections.frequencyKey) continue;
    for (const d of snapshot.durations) {
      if (vary === "frequency" && d.weeks !== selections.durationWeeks) continue;
      if (f.key === selections.frequencyKey && d.weeks === selections.durationWeeks) continue;
      const p = price(snapshot, { ...selections, frequencyKey: f.key, durationWeeks: d.weeks });
      if (!p) continue;
      const includes = p.adjustments.flatMap((a) => {
        const rule = snapshot.discounts?.find((x) => x.key === a.discountKey);
        return rule ? [{ name: rule.name, percent: rule.percent }] : [];
      });
      alternatives.push({
        id: `${f.key}:${d.weeks}`,
        label: vary === "frequency" ? `${f.weekdays.length}-day delivery` : vary === "duration" ? `${d.weeks} weeks` : `${d.weeks} weeks on ${f.weekdays.length}-day delivery`,
        total: p.total,
        units: p.units,
        payload: { frequencyKey: f.key, durationWeeks: d.weeks, tiffinCount: p.units, total: p.total, includes, tierMinQty: p.tierMinQty, tierChanged: p.tierMinQty !== current.tierMinQty },
      });
    }
  }
  return rankDeals(current, alternatives, { limit: cap });
}
