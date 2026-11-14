import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { frequencyFits, planWeek, type DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import { rankDeals, type RankedDeal } from "@foundry/discounts";
import type { PricingSelections } from "./types";

export interface DealPayload {
  frequencyKey: string;
  durationWeeks: number;
  includes: { name: string; percent: number }[];
}

// Display only: every number comes from the server's catalog.deals table (buildDealTable). Deals
// compare on the discount alone: a flat delivery fee spread over more tiffins is cheaper per
// tiffin, but it isn't a discount and must not be advertised as "Save N%". rankDeals compares
// total/units, so feeding it (100 - pct) per unit ranks on discounts only.
const dealBasis = (pct: number) => ({ total: 100 - pct, units: 1 });

/** Per-tiffin discount of each plan length vs the shortest one (same delivery type), as whole percents. */
export function durationSavings(snapshot: ClientCatalogSnapshot, selections: PricingSelections): Record<number, number> {
  return snapshot.deals?.durationSavings[selections.frequencyKey] ?? {};
}

type Alt = Parameters<typeof rankDeals<DealPayload>>[1][number];

function options(snapshot: ClientCatalogSnapshot, selections: PricingSelections, vary?: "frequency" | "duration") {
  const eating = (selections.eatingDays ?? []) as DayOfWeek[];
  const table = snapshot.deals?.options;
  const current = table?.[selections.frequencyKey]?.[selections.durationWeeks];
  if (!table || !current) return null;
  let currentAlt: Alt | null = null;
  const alternatives: Alt[] = [];
  // Never suggest a frequency the picked size can't be delivered on (a size made only on some days).
  const allowed = snapshot.mealSizes?.find((m) => m.publicId === selections.mealSizeId)?.allowedDays;
  for (const f of snapshot.frequencies) {
    if (!f.weekdays?.length) continue;
    if (!frequencyFits(f.weekdays as DayOfWeek[], allowed)) continue;
    if (planWeek(f.weekdays as DayOfWeek[], eating) === null) continue;
    if (vary === "duration" && f.key !== selections.frequencyKey) continue;
    for (const d of snapshot.durations) {
      if (vary === "frequency" && d.weeks !== selections.durationWeeks) continue;
      const isCurrent = f.key === selections.frequencyKey && d.weeks === selections.durationWeeks;
      const p = table[f.key]?.[d.weeks];
      if (!p) continue;
      const alt: Alt = {
        id: `${f.key}:${d.weeks}`,
        label: vary === "frequency" ? `${f.weekdays.length}-day delivery` : vary === "duration" ? `${d.weeks} weeks` : `${d.weeks} weeks on ${f.weekdays.length}-day delivery`,
        ...dealBasis(p.pct),
        payload: { frequencyKey: f.key, durationWeeks: d.weeks, includes: p.includes },
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
  const dearest = (alts: Alt[]) => alts.filter((a) => a.units > 0).reduce<Alt | null>((w, a) => (w === null || perUnit(a) > perUnit(w) ? a : w), null);
  const cheaper = rankDeals(dealBasis(o.current.pct), o.alternatives, { limit: 1 })[0];
  if (cheaper) {
    // Quote the saving against the dearest option (the baseline the "Save N%" pills use), not against
    // the current pick — otherwise a 4wk pick already at 5% off shows 12wk at 10% as "save 5%".
    const top = dearest([o.currentAlt, ...o.alternatives]);
    const alt = o.alternatives.find((a) => a.id === cheaper.id);
    const [vsBase] = top && alt ? rankDeals({ total: top.total, units: top.units }, [alt], { limit: 1 }) : [];
    return { state: "recommend", deal: vsBase ?? cheaper };
  }
  const least = dearest(o.alternatives);
  if (!least) return { state: "none" };
  const [deal] = rankDeals({ total: least.total, units: least.units }, [o.currentAlt], { limit: 1 });
  return deal && cur < perUnit(least) ? { state: "applied", deal, least: least.payload } : { state: "none" };
}
