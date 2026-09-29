/**
 * Per-pick diet for custom meals. A custom meal prices each `meal_size_items` row by its
 * own plan (veg / non-veg), so pick N of a category may only serve row N's plan: a veg
 * sabzi row (base or WordPress add-on) never gets chicken, the non-veg row gets a non-veg
 * dish by default. Catalog sizes keep the reachable-plan union plus meal rules.
 */
export type RowPlans = Map<string, bigint[]>;

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
