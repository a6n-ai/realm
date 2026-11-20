import { DAY_NAMES, isWeekendDay, isoToUtcDate } from "@foundry/commons/util/dates";
export type CostRate = { category: string; planId: bigint | null; organizationId: string | null; costBase: number; costPerTu: number };
export type CostPick = { category: string; planId: bigint; tu: number | null };

export function rateFor(rates: CostRate[], category: string, planId: bigint, organizationId: string | null): CostRate | null {
  const scopes: Array<[string | null, bigint | null]> = [
    [organizationId, planId],
    [organizationId, null],
    [null, planId],
    [null, null],
  ];
  for (const [org, plan] of scopes) {
    const hit = rates.find((r) => r.category === category && r.organizationId === org && r.planId === plan);
    if (hit) return hit;
  }
  return null;
}

export function tiffinFoodCost(picks: CostPick[], rates: CostRate[], organizationId: string | null): { cost: number; unrated: string[] } {
  let cost = 0;
  const unrated = new Set<string>();
  for (const pick of picks) {
    const rate = rateFor(rates, pick.category, pick.planId, organizationId);
    if (!rate || pick.tu === null) {
      unrated.add(pick.category);
      continue;
    }
    cost += rate.costBase + rate.costPerTu * pick.tu;
  }
  return { cost, unrated: [...unrated].sort() };
}

/**
 * The picks eaten on one day. Sat/Sun eat only weekend-dish categories. Weekdays drop them while the
 * meal has anything else (prod: weekend_dish is a Sat/Sun-only menu slot), else keep all of them.
 */
export function picksForDay(picks: CostPick[], weekendCategories: ReadonlySet<string>, weekend: boolean): CostPick[] {
  const own = picks.filter((p) => weekendCategories.has(p.category) === weekend);
  return weekend || own.length > 0 ? own : picks;
}

export const isWeekendIso = (isoDate: string): boolean => isWeekendDay(DAY_NAMES[isoToUtcDate(isoDate).getUTCDay()]!.toLowerCase());
