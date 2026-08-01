// Which container a given pick goes in. Pure, so the mapping is testable without a DB.
//
// orders.categoryCounts is built by SUMMING meal_size_items.qty per category
// (orders.service.ts), which discards weightValue/weightUnit — so a pick knows its
// category and its index within that category, but not its size. The size is still in the
// catalog: expand each meal_size_item into `qty` slots in sortOrder, and pickIndex N is
// the Nth slot. A sabzi line of qty 2 @ 8oz gives picks 1 and 2 at 8oz; a dal line of
// qty 1 @ 12oz gives pick 1 at 12oz. That reproduces the "(Main Veg) 8oz / 12oz" split
// the kitchen counts by today.

export type MealSizeItemRow = {
  category: string;
  qty: number;
  weightValue: string | null;
  weightUnit: "oz" | "g" | "ml" | "piece" | null;
  sortOrder: number;
};

/** e.g. "8oz", or null when the catalog line carries no weight. */
export function formatPortion(
  weightValue: string | null,
  weightUnit: MealSizeItemRow["weightUnit"],
): string | null {
  if (weightValue == null || weightUnit == null) return null;
  const n = Number(weightValue);
  if (!Number.isFinite(n)) return null;
  // 8.00 → "8"; 2.50 → "2.5". Trailing zeros read as false precision on a label.
  const trimmed = String(Number(n.toFixed(2)));
  return weightUnit === "piece" ? `${trimmed} pc` : `${trimmed}${weightUnit}`;
}

/**
 * pickIndex (1-based) → portion string, per category.
 *
 * Ties on sortOrder fall back to the catalog's own row order, which is stable within one
 * query but arbitrary across edits — a category whose lines share a sortOrder cannot be
 * mapped reliably, so callers wanting certainty should keep sortOrder unique per category.
 */
export function portionsByCategory(items: MealSizeItemRow[]): Map<string, (string | null)[]> {
  const byCategory = new Map<string, MealSizeItemRow[]>();
  for (const item of items) {
    const list = byCategory.get(item.category);
    if (list) list.push(item);
    else byCategory.set(item.category, [item]);
  }

  const out = new Map<string, (string | null)[]>();
  for (const [category, list] of byCategory) {
    const slots: (string | null)[] = [];
    for (const item of [...list].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const portion = formatPortion(item.weightValue, item.weightUnit);
      // qty is the number of containers this line produces, not a multiplier on one.
      for (let i = 0; i < Math.max(0, item.qty); i++) slots.push(portion);
    }
    out.set(category, slots);
  }
  return out;
}

/** Null when the meal size has fewer slots in that category than the order's counts claim. */
export function portionForPick(
  portions: Map<string, (string | null)[]>,
  category: string,
  pickIndex: number,
): string | null {
  return portions.get(category)?.[pickIndex - 1] ?? null;
}
