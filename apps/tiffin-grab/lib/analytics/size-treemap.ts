import { round2 } from "@foundry/commons/util/money";

export type SizeSale = { plan: string; size: string; custom: boolean; revenue: number; tiffins: number };
export type SizeMetric = "revenue" | "tiffins";
export type TreemapGroup = { name: string; children: { name: string; value: number; color?: string }[] };

export const CUSTOM_SIZES_LABEL = "Custom sizes";

/** Plan -> meal size boxes sized by one metric. Custom sizes of a plan fold into one box; zero boxes and empty plans are dropped. */
export function buildSizeTreemap(rows: SizeSale[], metric: SizeMetric, planOrder: (a: string, b: string) => number): TreemapGroup[] {
  const plans = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const sizes = plans.get(r.plan) ?? new Map<string, number>();
    const name = r.custom ? CUSTOM_SIZES_LABEL : r.size;
    sizes.set(name, round2((sizes.get(name) ?? 0) + r[metric]));
    plans.set(r.plan, sizes);
  }
  return [...plans]
    .sort(([a], [b]) => planOrder(a, b))
    .map(([name, sizes]) => ({
      name,
      children: [...sizes].filter(([, value]) => value > 0).map(([n, value]) => ({ name: n, value })).sort((a, b) => b.value - a.value),
    }))
    .filter((g) => g.children.length > 0);
}
