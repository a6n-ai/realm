/**
 * Per-pick diet for custom meals. A custom meal prices each `meal_size_items` row by its
 * own plan (veg / non-veg), so pick N of a category may only serve row N's plan: a veg
 * sabzi row (base or WordPress add-on) never gets chicken, the non-veg row gets a non-veg
 * dish by default. Catalog sizes keep the reachable-plan union plus meal rules.
 */
import { foldSwaps, type SlotRow, type SwapRow } from "./swap-rules";

// null = a pick a swap brought in: no row of its own, so it serves the whole day's menu.
export type RowPlans = Map<string, (bigint | null)[]>;

export function rowPlanIds(
  items: { category: string; planId: bigint; sortOrder: number }[],
  custom: boolean,
): RowPlans | null {
  if (!custom) return null;
  const out: RowPlans = new Map();
  for (const it of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = out.get(it.category);
    if (list) list.push(it.planId);
    else out.set(it.category, [it.planId]);
  }
  return out;
}

/**
 * Row plans after a delivery's swaps, folded like portions are (the exact row given up goes,
 * later rows keep their own diet). Without this, giving up the non-veg 8oz sabzi row turned the
 * remaining veg 12oz row into "pick 1" and handed it the non-veg dish.
 */
export function rowPlansAfterSwaps(rowPlans: RowPlans | null, swaps: SwapRow[]): RowPlans | null {
  if (!rowPlans || swaps.length === 0) return rowPlans;
  const slots = new Map<string, SlotRow<bigint | null>[]>();
  for (const [category, plans] of rowPlans) slots.set(category, plans.map((value, row) => ({ row, value })));
  // receiveTu is a portion size, never a plan: drop it so received picks stay plan-less.
  const folded = foldSwaps(slots, swaps.map((s) => ({ ...s, receiveTu: null })), { sameUnit: () => false, receiveTu: () => null });
  return new Map([...folded].map(([category, rows]) => [category, rows.map((r) => r.value)]));
}

export function itemsForRow<T extends { planId?: bigint | string }>(
  items: T[],
  rowPlans: RowPlans | null,
  category: string,
  pickIndex: number,
): T[] {
  const plan = rowPlans?.get(category)?.[pickIndex - 1];
  if (plan == null) return items;
  const own = items.filter((i) => i.planId != null && String(i.planId) === String(plan));
  // ponytail: a day with no dish of the row's diet serves the whole menu rather than an
  // empty box; a released week always carries both diets today.
  return own.length ? own : items;
}

/** "Non-Veg" for a row whose category mixes diets; undefined where one diet covers them all. */
export function rowDietLabel(rowPlans: RowPlans | null, planKeys: Map<bigint, string>, category: string, pickIndex: number): string | undefined {
  const rows = rowPlans?.get(category);
  const key = rows && new Set(rows).size > 1 ? planKeys.get(rows[pickIndex - 1]!) : undefined;
  return key?.replace(/(^|-)(\w)/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}
