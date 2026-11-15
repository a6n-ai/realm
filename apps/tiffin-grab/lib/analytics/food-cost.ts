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
