import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";
import { rankDeals, type RankedDeal } from "@foundry/discounts";
import { buildPricingCatalog } from "./build-catalog";
import { priceSubscription } from "./engine";
import type { PricingSelections } from "./types";

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

export function recommendDeals({ snapshot, selections, cap = 1, vary }: { snapshot: ClientCatalogSnapshot; selections: PricingSelections; cap?: number; vary?: "frequency" | "duration" }): RankedDeal<DealPayload>[] {
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
