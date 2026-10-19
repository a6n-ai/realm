/**
 * Per-pick diet. A custom meal prices each `meal_size_items` row by its own plan (veg /
 * non-veg), so pick N of a category may only serve row N's plan: a veg sabzi row never gets
 * chicken, the non-veg row gets a non-veg dish by default. Catalog add-on rows follow their
 * own plan on every meal size ("Non-Veg Sabzi" add-on → non-veg). Catalog meal rows keep the
 * reachable-plan union plus meal rules.
 */
import { foldSwaps, type SlotRow, type SwapRow } from "./swap-rules";

// Each pick's plans in priority order: the first one with a dish on the day's menu serves it.
// null = no diet of its own (a catalog meal row, or a pick a swap brought in): the whole menu.
export type RowPlans = Map<string, (bigint[] | null)[]>;

type RowItem = { category: string; planId: bigint; sortOrder: number; addon?: true; fallbackPlanIds?: bigint[] };

export function rowPlanIds(items: RowItem[], custom: boolean): RowPlans | null {
  if (!custom && !items.some((i) => i.addon)) return null;
  const out: RowPlans = new Map();
  for (const it of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const plans = custom || it.addon ? [it.planId, ...(it.fallbackPlanIds ?? [])] : null;
    const list = out.get(it.category);
    if (list) list.push(plans);
    else out.set(it.category, [plans]);
  }
  return out;
}

export function itemsForRow<T extends { planId?: bigint | string }>(
  items: T[],
  rowPlans: RowPlans | null,
  category: string,
  pickIndex: number,
): T[] {
  const plans = rowPlans?.get(category)?.[pickIndex - 1];
  if (plans == null) return items;
  for (const plan of plans) {
    const own = items.filter((i) => i.planId != null && String(i.planId) === String(plan));
    if (own.length) return own;
  }
  // ponytail: a day with no dish of any of the row's plans serves the whole menu rather than an
  // empty box; a released week always carries both diets today.
  return items;
}

/** "Non-Veg" for a row whose category mixes diets; undefined where one diet covers them all. */
export function rowDietLabel(rowPlans: RowPlans | null, planKeys: Map<bigint, string>, category: string, pickIndex: number): string | undefined {
  const rows = rowPlans?.get(category)?.map((r) => (r?.[0] == null ? null : String(r[0])));
  const first = rowPlans?.get(category)?.[pickIndex - 1]?.[0];
  const key = rows && new Set(rows).size > 1 && first != null ? planKeys.get(first) : undefined;
  return key?.replace(/(^|-)(\w)/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/**
 * Row plans after a delivery's swaps, folded like portions are (the exact row given up goes,
 * later rows keep their own diet). Without this, giving up the non-veg 8oz sabzi row turned the
 * remaining veg 12oz row into "pick 1" and handed it the non-veg dish.
 */
export function rowPlansAfterSwaps(rowPlans: RowPlans | null, swaps: SwapRow[]): RowPlans | null {
  if (!rowPlans || swaps.length === 0) return rowPlans;
  const slots = new Map<string, SlotRow<bigint[] | null>[]>();
  for (const [category, plans] of rowPlans) slots.set(category, plans.map((value, row) => ({ row, value })));
  // receiveTu is a portion size, never a plan: drop it so received picks stay plan-less.
  const folded = foldSwaps(slots, swaps.map((s) => ({ ...s, receiveTu: null })), { sameUnit: () => false, receiveTu: () => null });
  return new Map([...folded].map(([category, rows]) => [category, rows.map((r) => r.value)]));
}
