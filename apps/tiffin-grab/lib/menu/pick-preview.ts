/**
 * Edit meal's preview of unsaved swaps — pure, so the sheet folds a swap in
 * instantly instead of asking the server for a fresh grid on every tap, and the
 * server builds the very same preview when it is asked for one.
 */
import { isContainerCategory, type TuCategory } from "./format-tu";
import type { GridCell } from "./meals-grid";
import { computeAllSwapOptions, validateProposedSwap, type CompositionContext, type MealSizeItemRow as SwapItemRow, type SwapOption } from "./meal-validation";
import { portionsByCategory, slotRowsAfterSwaps, type MealSizeItemRow, type PortionSwap } from "./pick-size";
import type { ExchangeOverride, SwapCategory } from "./swap-rules";

export type ProvisionalSwap = PortionSwap & { forDate: string };

/** Everything the preview needs, loaded once with the grid. Plain arrays so it crosses the server-action boundary. */
export type PreviewBase = {
  items: MealSizeItemRow[];
  tu: [string, TuCategory][];
  /** Saved swaps that apply to each eating day, in the order they were applied. */
  appliedByDate: Record<string, PortionSwap[]>;
  composition: {
    baseCounts: Record<string, number>;
    mealSizeItems: SwapItemRow[];
    categories: [string, SwapCategory][];
    labels?: Record<string, string>;
  };
  pairs: { fromCategory: string; toCategory: string; exchangeOverrides?: ExchangeOverride[]; naturalFallback?: boolean }[];
};

const keyOf = (c: GridCell) => `${c.dateIso}:${c.slot}:${c.personIndex}:${c.pickIndex}`;

/**
 * Cells with the unsaved swaps folded in: each removes the row it names (else the
 * leading ones) and appends picks to toCategory — the same fold portionsByCategory
 * runs, so cells and portions stay aligned. Never mutates `cells`.
 */
export function foldProvisionalCells(args: {
  cells: GridCell[];
  categories: { key: string; selectable: boolean }[];
  base: Pick<PreviewBase, "items" | "tu" | "appliedByDate">;
  provisional: ProvisionalSwap[];
  /** The day's menu per category: a swap into a category the meal lacks takes that category's dishes. */
  menu?: Record<string, Record<string, GridCell["dishes"]>>;
}): GridCell[] {
  const { categories, base, provisional, menu } = args;
  let cells = args.cells.map((c) => ({ ...c }));
  if (provisional.length === 0) return cells;
  const tuByKey = new Map(base.tu);
  const catMeta = new Map(categories.map((c) => [c.key, c]));
  for (const [i, ps] of provisional.entries()) {
    const date = ps.forDate;
    // Rows still in the meal before this swap: that day's saved swaps, then the earlier unsaved ones.
    const rowsBefore = slotRowsAfterSwaps(
      base.items,
      [...(base.appliedByDate[date] ?? []), ...provisional.slice(0, i).filter((p) => p.forDate === date)],
      tuByKey,
    );
    const persons = [...new Set(cells.filter((c) => c.dateIso === date).map((c) => c.personIndex))];
    for (const person of persons) {
      const mine = (slot: string) =>
        cells.filter((c) => c.dateIso === date && c.personIndex === person && c.slot === slot).sort((a, b) => a.pickIndex - b.pickIndex);
      const fromCells = mine(ps.fromCategory);
      const at = Math.max(0, ps.fromRow == null ? 0 : (rowsBefore.get(ps.fromCategory) ?? []).findIndex((r) => r.row === ps.fromRow));
      const spliced = fromCells.slice(at, at + ps.qtyFrom);
      const gone = new Set(spliced.map(keyOf));
      cells = cells.filter((c) => !gone.has(keyOf(c)));
      // Keep pickIndex contiguous from 1, like the server's resolved picks.
      mine(ps.fromCategory).forEach((c, n) => { c.pickIndex = n + 1; });

      const existingTo = mine(ps.toCategory);
      // The destination's own dishes: its existing cells, else that day's menu for it. Never the
      // source row's dishes — a custom meal with no Daal swapping Sabzi → Daal got its sabzi list,
      // so the new Daal row read "Patta Gobhi" (Granvin, 2026-10-07).
      const toDishes = existingTo[0]?.dishes ?? menu?.[date]?.[ps.toCategory] ?? [];
      const fixed = !(catMeta.get(ps.toCategory)?.selectable ?? true);
      // A count category (roti) is one folded row: received units join its total (previewPortions), not a new row.
      const tu = tuByKey.get(ps.toCategory);
      if (existingTo.length > 0 && tu && !isContainerCategory(tu) && tu.selectable === false) continue;
      const basePickIndex = existingTo.length > 0 ? Math.max(...existingTo.map((c) => c.pickIndex)) : 0;
      for (let n = 0; n < ps.qtyTo; n++) {
        const src = spliced[n] ?? spliced[0];
        if (!src) break;
        cells.push({
          day: src.day,
          dateIso: src.dateIso,
          slot: ps.toCategory,
          personIndex: person,
          pickIndex: basePickIndex + n + 1,
          selectable: catMeta.get(ps.toCategory)?.selectable ?? true,
          quantity: 1,
          // A fixed destination has one dish that day; name it so the row and summary show it.
          selectedDishId: fixed ? (toDishes[0]?.id ?? null) : null,
          isDefaulted: fixed,
          dishes: toDishes,
          locked: src.locked,
          lockNote: src.lockNote,
        });
      }
    }
  }
  return cells;
}

/** Portions per category for one eating day after its saved and unsaved swaps. */
export function previewPortions(
  base: Pick<PreviewBase, "items" | "tu" | "appliedByDate">,
  date: string,
  provisional: ProvisionalSwap[],
): Record<string, (string | null)[]> {
  const swaps: PortionSwap[] = [
    ...(base.appliedByDate[date] ?? []),
    ...provisional.filter((s) => s.forDate === date).map(({ forDate: _, ...s }) => s),
  ];
  return Object.fromEntries(portionsByCategory(base.items, new Map(base.tu), swaps));
}

/**
 * The swaps for one eating day, unavailable ones included: Edit meal greys them with their reason
 * ("Undo your Roti → Rice swap first") instead of letting a choice vanish when another is picked.
 */
export function previewSwapOptions(base: PreviewBase, date: string, provisional: ProvisionalSwap[]): SwapOption[] {
  const { composition, applied } = previewStack(base, date, provisional);
  return computeAllSwapOptions({ composition, applied, pairs: base.pairs, hideUnavailable: false });
}

/**
 * The override size a pending swap of this exact row gets, as applyDeliverySwap will
 * store it; null = natural exchange. Bundles are sized from the leading row, so a
 * pending swap of another row (the 8oz Daal, not the 12oz) must be sized on its own.
 */
export function previewOverride(
  base: PreviewBase,
  date: string,
  provisional: ProvisionalSwap[],
  next: { fromCategory: string; toCategory: string; fromPicks: number; fromRow: number | null },
): { receiveTu: number; qtyTo: number } | null {
  const pair = base.pairs.find((p) => p.fromCategory === next.fromCategory && p.toCategory === next.toCategory);
  const overrides = pair?.exchangeOverrides;
  if (!overrides?.length) return null;
  const r = validateProposedSwap({ ...previewStack(base, date, provisional), next, overrides, naturalFallback: pair?.naturalFallback });
  return r.ok && r.receiveTu != null ? { receiveTu: r.receiveTu, qtyTo: r.qtyTo } : null;
}

function previewStack(base: PreviewBase, date: string, provisional: ProvisionalSwap[]) {
  const composition: CompositionContext = { ...base.composition, categories: new Map(base.composition.categories) };
  const applied = [
    ...(base.appliedByDate[date] ?? []),
    ...provisional.filter((s) => s.forDate === date && s.qtyFrom > 0).map(({ forDate: _, ...s }) => s),
  ];
  return { composition, applied };
}
