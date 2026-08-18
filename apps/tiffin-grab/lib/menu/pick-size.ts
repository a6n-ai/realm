// Which container a given pick goes in. Pure, so the mapping is testable without a DB.
//
// orders.categoryCounts is built by COUNTING meal_size_items rows per category
// (orders.service.ts) — one row is one pick, unrelated to portion size. The portion
// itself lives in tuAmount (tiffin units) and is rendered via formatTuHuman using the
// category's own unit conversion: each meal_size_item IS one slot in sortOrder, and
// pickIndex N is the Nth row. A sabzi category with two rows @ 1 TU each gives picks
// 1 and 2 at that portion; a dal category with one row @ 1.5 TU gives pick 1 at that portion.
import { formatTuHuman, type TuCategory } from "./format-tu";

export type MealSizeItemRow = {
  category: string;
  tuAmount: string | null;
  sortOrder: number;
};

/** e.g. "12oz" or "4 roti", or null when the catalog line carries no TU amount. */
export function formatPortion(tuAmount: string | null, category: TuCategory | null): string | null {
  if (tuAmount == null || category == null) return null;
  const n = Number(tuAmount);
  if (!Number.isFinite(n)) return null;
  return formatTuHuman(category, n);
}

/**
 * pickIndex (1-based) → portion string, per category.
 *
 * Ties on sortOrder fall back to the catalog's own row order, which is stable within one
 * query but arbitrary across edits — a category whose lines share a sortOrder cannot be
 * mapped reliably, so callers wanting certainty should keep sortOrder unique per category.
 */
export type PortionSwap = {
  fromCategory: string;
  toCategory: string;
  qtyFrom: number;
  qtyTo: number;
};

export function portionsByCategory(
  items: MealSizeItemRow[],
  categoriesByKey: Map<string, TuCategory>,
  swaps: PortionSwap[] = [],
): Map<string, (string | null)[]> {
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
      slots.push(formatPortion(item.tuAmount, categoriesByKey.get(category) ?? null));
    }
    out.set(category, slots);
  }

  // Snapshot each category's ORIGINAL catalog portion before the swap loop
  // below mutates `out` — otherwise a second portionless swap into the same
  // category would inherit whatever the first swap just pushed, instead of
  // the catalog line, making the fallback order-dependent.
  const catalogFirstPortion = new Map<string, string | null>();
  for (const [category, slots] of out) catalogFirstPortion.set(category, slots[0] ?? null);

  // Applied swaps move slots between categories. TU is the shared currency now, so a
  // pick moved INTO toCategory carries toCategory's own catalog portion — no per-swap
  // override needed.
  for (const s of swaps) {
    const from = out.get(s.fromCategory) ?? [];
    from.splice(Math.max(0, from.length - s.qtyFrom), s.qtyFrom);
    out.set(s.fromCategory, from);

    const to = out.get(s.toCategory) ?? [];
    const portion = catalogFirstPortion.get(s.toCategory) ?? null;
    for (let i = 0; i < s.qtyTo; i++) to.push(portion);
    out.set(s.toCategory, to);
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
