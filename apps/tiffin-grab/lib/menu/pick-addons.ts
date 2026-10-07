/**
 * Edit meal's split of a tiffin into the meal and its add-ons. Pure (no db), so the sheet and
 * tests share it. Add-on rows sit after the meal's own rows (sortOrder ≥ ADDON_SORT_BASE), are
 * picked from the menu only, and never take part in a swap.
 */
import { isContainerCategory, type TuCategory } from "./format-tu";
import { cellKey, type AnchoredGroup, type PickCategoryGroup } from "./pick-groups";
import { previewPortions, type PreviewBase, type ProvisionalSwap } from "./pick-preview";
import { portionsByCategory } from "./pick-size";

/** Add-on rows are appended after every meal row: sortOrder at or above this marks one. */
export const ADDON_SORT_BASE = 100_000;

/** A category whose rows fold into one total (8 roti), not one row per container (Sabzi 12oz). */
export const isCountCategory = (tu: TuCategory | undefined) => !!tu && !isContainerCategory(tu) && tu.selectable === false;

/**
 * Cell keys of the per-row add-ons (an extra Sabzi): a category's last N plain rows, where N is
 * its add-on count. Count categories (roti, rice) have one folded row, so they're handled by
 * `countAddons` instead. Swapped rows are never add-ons: swaps only take meal rows.
 */
export function addonRowKeys(
  groups: Pick<AnchoredGroup, "key" | "items">[],
  addonCounts: Record<string, number>,
): Set<string> {
  const keys = new Set<string>();
  for (const g of groups) {
    const n = addonCounts[g.key] ?? 0;
    const plain = g.items.flatMap((x) => (x.kind === "cell" ? [x.cell] : []));
    if (!n || !plain.every((c) => c.quantity === 1)) continue;
    for (const c of plain.slice(-n)) keys.add(cellKey(c));
  }
  return keys;
}

export type CountAddon = { category: string; portion: string | null };

/**
 * Count-category add-ons (2 extra roti) as their own lines, and the meal's own portion for those
 * categories (8 roti, not 10) so the meal row stops including the add-on.
 */
export function countAddons(
  base: Pick<PreviewBase, "items" | "tu" | "appliedByDate">,
  date: string,
  provisional: ProvisionalSwap[],
): { addons: CountAddon[]; mealPortions: Record<string, (string | null)[]> } {
  const tu = new Map(base.tu);
  const extra = base.items.filter((i) => i.sortOrder >= ADDON_SORT_BASE && isCountCategory(tu.get(i.category)));
  if (extra.length === 0) return { addons: [], mealPortions: {} };
  const categories = new Set(extra.map((i) => i.category));
  const meal = previewPortions({ ...base, items: base.items.filter((i) => i.sortOrder < ADDON_SORT_BASE) }, date, provisional);
  const own = portionsByCategory(extra, tu);
  return {
    addons: [...categories].map((category) => ({ category, portion: own.get(category)?.[0] ?? null })),
    mealPortions: Object.fromEntries([...categories].map((c) => [c, meal[c] ?? []])),
  };
}

/** Groups cut in two by cell: the meal's own rows, and the add-on rows (portions kept aligned to cells). */
export function splitGroups(groups: PickCategoryGroup[], addonKeys: Set<string>): { meal: PickCategoryGroup[]; addons: PickCategoryGroup[] } {
  const part = (keep: (key: string) => boolean) =>
    groups.flatMap((g) => {
      const idx = g.cells.flatMap((c, i) => (keep(cellKey(c)) ? [i] : []));
      if (idx.length === 0) return [];
      return [{ ...g, cells: idx.map((i) => g.cells[i]!), portions: idx.map((i) => g.portions[i] ?? null), chooseCount: g.selectable ? idx.length : g.chooseCount }];
    });
  return { meal: part((k) => !addonKeys.has(k)), addons: part((k) => addonKeys.has(k)) };
}

/** Base (pre-swap) portions of the meal's own rows only: what a swap gives up is never an add-on. */
export function mealBasePortions(base: Pick<PreviewBase, "items" | "tu">): Record<string, (string | null)[]> {
  return Object.fromEntries(portionsByCategory(base.items.filter((i) => i.sortOrder < ADDON_SORT_BASE), new Map(base.tu)));
}
