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
}

const price = (snapshot: ClientCatalogSnapshot, s: PricingSelections) => {
  try {
    const r = priceSubscription(s, buildPricingCatalog(snapshot as never, s));
    const tiffinSubtotal = r.lineItems[0]?.amount ?? 0;
    const ruleKeys = new Set((snapshot.discounts ?? []).map((d) => d.key));
    const discounted = r.adjustments.filter((a) => a.discountKey && ruleKeys.has(a.discountKey)).reduce((sum, a) => sum + a.amount, 0);
    // Share of the food price taken off by configured discounts. Deals compare on this alone: a flat
    // delivery fee spread over more tiffins is cheaper per tiffin, but it isn't a discount and must
    // not be advertised as "Save N%".
    const discountPct = tiffinSubtotal > 0 ? (discounted / tiffinSubtotal) * 100 : 0;
    return { total: r.total, units: r.tiffinCount, adjustments: r.adjustments, discountPct };
  } catch {
    return null;
  }
};

// rankDeals compares total/units; feeding it (100 - discountPct) per unit ranks on discounts only.
const dealBasis = (p: { units: number; discountPct: number }) => ({ total: p.units * (100 - p.discountPct), units: p.units });

/** Per-tiffin discount of each plan length vs the shortest one (same delivery type, eating days and meal),
 * as whole percents — configured discounts only. */
export function durationSavings(snapshot: ClientCatalogSnapshot, selections: PricingSelections): Record<number, number> {
  const weeks = snapshot.durations.map((d) => d.weeks).sort((a, b) => a - b);
  const pctFor = (w: number) => price(snapshot, { ...selections, durationWeeks: w })?.discountPct ?? null;
  const base = weeks.length ? pctFor(weeks[0]) : null;
  const out: Record<number, number> = {};
  if (base == null) return out;
  for (const w of weeks.slice(1)) {
    const pct = pctFor(w);
    const save = pct == null ? 0 : Math.round((1 - (100 - pct) / (100 - base)) * 100);
    if (save >= 1) out[w] = save;
  }
  return out;
}

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
        ...dealBasis(p),
        payload: { frequencyKey: f.key, durationWeeks: d.weeks, tiffinCount: p.units, total: p.total, includes },
      };
      if (isCurrent) currentAlt = alt;
      else alternatives.push(alt);
    }
  }
  // rankDeals keeps input order on equal savings: list the option that changes the least first,
  // so the same discount never suggests switching plan length (or delivery) for nothing.
  const changes = (a: Alt) => Number(a.payload.frequencyKey !== selections.frequencyKey) + Number(a.payload.durationWeeks !== selections.durationWeeks);
  alternatives.sort((a, b) => changes(a) - changes(b));
  return { current, currentAlt, alternatives };
}

export function recommendDeals({ snapshot, selections, cap = 1, vary }: { snapshot: ClientCatalogSnapshot; selections: PricingSelections; cap?: number; vary?: "frequency" | "duration" }): RankedDeal<DealPayload>[] {
  const o = options(snapshot, selections, vary);
  return o ? rankDeals(dealBasis(o.current), o.alternatives, { limit: cap }) : [];
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
  const cheaper = rankDeals(dealBasis(o.current), o.alternatives, { limit: 1 })[0];
  if (cheaper) return { state: "recommend", deal: cheaper };
  const least = o.alternatives.filter((a) => a.units > 0).reduce<Alt | null>((w, a) => (w === null || perUnit(a) > perUnit(w) ? a : w), null);
  if (!least) return { state: "none" };
  const [deal] = rankDeals({ total: least.total, units: least.units }, [o.currentAlt], { limit: 1 });
  return deal && cur < perUnit(least) ? { state: "applied", deal, least: least.payload } : { state: "none" };
}
