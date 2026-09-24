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

/**
 * Counts rows per category from meal_size_items rows — canonical derivation of
 * categoryCounts from composition items.
 */
export function categoryCountsFromItems(items: { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }
  return counts;
}

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

/**
 * Per-category TU slot arrays after front-splice swaps (same mutation as portionsByCategory).
 * Receive-side slots use toCategory's first catalog TU (pair-fit receive rate).
 * `null` preserves catalog rows with no TU (formatted as null portions).
 */
export function slotTuAfterSwaps(
  items: MealSizeItemRow[],
  swaps: PortionSwap[] = [],
): Map<string, (number | null)[]> {
  const byCategory = new Map<string, MealSizeItemRow[]>();
  for (const item of items) {
    const list = byCategory.get(item.category);
    if (list) list.push(item);
    else byCategory.set(item.category, [item]);
  }

  const out = new Map<string, (number | null)[]>();
  for (const [category, list] of byCategory) {
    const slots = [...list]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => {
        if (item.tuAmount == null || item.tuAmount === "") return null;
        const n = Number(item.tuAmount);
        return Number.isFinite(n) ? n : null;
      });
    out.set(category, slots);
  }

  const catalogFirst = new Map<string, number | null>();
  for (const [category, slots] of out) catalogFirst.set(category, slots[0] ?? null);

  for (const s of swaps) {
    const from = out.get(s.fromCategory) ?? [];
    from.splice(0, s.qtyFrom);
    out.set(s.fromCategory, from);

    const to = out.get(s.toCategory) ?? [];
    const receiveTu = catalogFirst.get(s.toCategory) ?? null;
    for (let i = 0; i < s.qtyTo; i++) to.push(receiveTu);
    out.set(s.toCategory, to);
  }
  return out;
}

export function portionsByCategory(
  items: MealSizeItemRow[],
  categoriesByKey: Map<string, TuCategory>,
  swaps: PortionSwap[] = [],
): Map<string, (string | null)[]> {
  const tus = slotTuAfterSwaps(items, swaps);
  const out = new Map<string, (string | null)[]>();
  for (const [category, slots] of tus) {
    const converter = categoriesByKey.get(category) ?? null;
    if (converter?.selectable === false) {
      if (slots.length === 0) {
        out.set(category, []);
      } else if (!slots.some((tu) => tu != null)) {
        out.set(category, [null]);
      } else {
        const totalTu = slots.reduce<number>((acc, tu) => acc + (tu ?? 0), 0);
        out.set(category, [converter && totalTu > 0 ? formatTuHuman(converter, totalTu) : null]);
      }
    } else {
      out.set(
        category,
        slots.map((tu) => (converter && tu != null ? formatTuHuman(converter, tu) : null)),
      );
    }
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

/**
 * Total TU for `pickCount` slots of a category after the same front-splice swaps as
 * portionsByCategory. Without swaps, wraps catalog lines when pickCount exceeds row count
 * (multi-person edge). With swaps, prefer remaining post-swap slots (no re-expanding removed rows).
 */
export function sumTuForPicks(
  items: MealSizeItemRow[],
  category: string,
  pickCount: number,
  swaps: PortionSwap[] = [],
): number {
  if (pickCount <= 0) return 0;
  const slots = slotTuAfterSwaps(items, swaps).get(category) ?? [];
  if (slots.length === 0) return 0;
  const num = (v: number | null) => (v == null ? 0 : v);
  let tu = 0;
  if (swaps.length === 0) {
    for (let i = 0; i < pickCount; i++) tu += num(slots[i % slots.length]!);
    return tu;
  }
  const n = Math.min(pickCount, slots.length);
  for (let i = 0; i < n; i++) tu += num(slots[i]!);
  return tu;
}
