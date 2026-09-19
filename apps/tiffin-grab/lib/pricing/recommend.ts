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

type Alt = Parameters<typeof rankDeals<DealPayload>>[1][number];

function options(snapshot: ClientCatalogSnapshot, selections: PricingSelections, vary?: "frequency" | "duration") {
  const eating = (selections.eatingDays ?? []) as DayOfWeek[];
  const current = price(snapshot, selections);
  if (!current) return null;
  let currentAlt: Alt | null = null;
  const alternatives: Alt[] = [];
  for (const f of snapshot.frequencies) {
    if (!f.weekdays?.length) continue;
    if (planWeek(f.weekdays as DayOfWeek[], eating) === null) continue;
    if (vary === "duration" && f.key !== selections.frequencyKey) continue;
    for (const d of snapshot.durations) {
      if (vary === "frequency" && d.weeks !== selections.durationWeeks) continue;
      const isCurrent = f.key === selections.frequencyKey && d.weeks === selections.durationWeeks;
      const p = isCurrent ? current : price(snapshot, { ...selections, frequencyKey: f.key, durationWeeks: d.weeks });
      if (!p) continue;
      const includes = p.adjustments.flatMap((a) => {
        const rule = snapshot.discounts?.find((x) => x.key === a.discountKey);
        return rule ? [{ name: rule.name, percent: rule.percent }] : [];
      });
      const alt: Alt = {
        id: `${f.key}:${d.weeks}`,
        label: vary === "frequency" ? `${f.weekdays.length}-day delivery` : vary === "duration" ? `${d.weeks} weeks` : `${d.weeks} weeks on ${f.weekdays.length}-day delivery`,
        total: p.total,
        units: p.units,
        payload: { frequencyKey: f.key, durationWeeks: d.weeks, tiffinCount: p.units, total: p.total, includes, tierMinQty: p.tierMinQty, tierChanged: p.tierMinQty !== current.tierMinQty },
      };
      if (isCurrent) currentAlt = alt;
      else alternatives.push(alt);
    }
  }
  return { current, currentAlt, alternatives };
}

export function recommendDeals({ snapshot, selections, cap = 1, vary }: { snapshot: ClientCatalogSnapshot; selections: PricingSelections; cap?: number; vary?: "frequency" | "duration" }): RankedDeal<DealPayload>[] {
  const o = options(snapshot, selections, vary);
  return o ? rankDeals(o.current, o.alternatives, { limit: cap }) : [];
}

export type DealComparison =
  | { state: "none" }
  | { state: "recommend"; deal: RankedDeal<DealPayload> }
  | { state: "applied"; deal: RankedDeal<DealPayload>; least: DealPayload };

const perUnit = (a: Alt) => a.total / a.units;

// Derived purely from the current selection (never click history) so it survives re-renders:
// "applied" = the current option is the cheapest per tiffin AND beats the dearest option by the
// same minimum saving rankDeals uses; otherwise a cheaper option is a "recommend".
export function compareOptions({ snapshot, selections, vary }: { snapshot: ClientCatalogSnapshot; selections: PricingSelections; vary?: "frequency" | "duration" }): DealComparison {
  const o = options(snapshot, selections, vary);
  if (!o?.currentAlt) return { state: "none" };
  const cur = perUnit(o.currentAlt);
  const cheaper = rankDeals(o.current, o.alternatives, { limit: 1 })[0];
  if (cheaper) return { state: "recommend", deal: cheaper };
  const least = o.alternatives.filter((a) => a.units > 0).reduce<Alt | null>((w, a) => (w === null || perUnit(a) > perUnit(w) ? a : w), null);
  if (!least) return { state: "none" };
  const [deal] = rankDeals({ total: least.total, units: least.units }, [o.currentAlt], { limit: 1 });
  return deal && cur < perUnit(least) ? { state: "applied", deal, least: least.payload } : { state: "none" };
}
