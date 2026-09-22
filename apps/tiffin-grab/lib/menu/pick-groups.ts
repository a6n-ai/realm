/**
 * Pure helpers for the customer Pick Meals sheet: group composition-row cells by
 * category for display without collapsing the underlying pickIndex model.
 */
import type { GridCell } from "@/lib/menu/meals-grid";

export type PickCategoryMeta = {
  key: string;
  label: string;
  selectable: boolean;
  sortOrder: number;
};

export type PickCategoryGroup = {
  key: string;
  label: string;
  selectable: boolean;
  /** Number of composition picks (cells) — never hardcoded. */
  chooseCount: number;
  cells: GridCell[];
  /** Human portions aligned to pickIndex order (1st cell → portions[0]). */
  portions: (string | null)[];
  /** Eligible dishes for this category (from the first selectable cell). */
  dishes: GridCell["dishes"];
};

export function cellKey(c: GridCell): string {
  return `${c.dateIso}:${c.slot}:${c.personIndex}:${c.pickIndex}`;
}

export function effectiveDishId(cell: GridCell, picked: Record<string, string>): string | null {
  return picked[cellKey(cell)] ?? cell.selectedDishId;
}

/**
 * Group a day's cells by category key, preserving pickIndex order within each group.
 * Multi-row same category (Sabzi 1.5 + Sabzi 1.0) → one group with chooseCount = 2.
 */
export function groupPickCells(
  cells: GridCell[],
  categories: PickCategoryMeta[],
  portionsBySlot: Record<string, (string | null)[]> = {},
): PickCategoryGroup[] {
  const byKey = new Map<string, GridCell[]>();
  for (const c of cells) {
    const list = byKey.get(c.slot) ?? [];
    list.push(c);
    byKey.set(c.slot, list);
  }

  const ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: PickCategoryGroup[] = [];
  for (const cat of ordered) {
    const mine = (byKey.get(cat.key) ?? []).slice().sort((a, b) => a.pickIndex - b.pickIndex);
    if (mine.length === 0) continue;
    const portions = portionsBySlot[cat.key] ?? [];
    groups.push({
      key: cat.key,
      label: cat.label,
      selectable: cat.selectable && mine.some((c) => c.selectable),
      chooseCount: mine[0]!.selectable ? mine.length : mine[0]!.quantity,
      cells: mine,
      portions: mine.map((c, i) => portions[c.pickIndex - 1] ?? portions[i] ?? null),
      dishes: mine.find((c) => c.selectable)?.dishes ?? mine[0]!.dishes,
    });
  }
  return groups;
}

/** How many picks the customer has explicitly changed (or non-default server picks). */
export function selectedProgress(group: PickCategoryGroup, picked: Record<string, string>): number {
  if (!group.selectable) return group.chooseCount;
  let n = 0;
  for (const c of group.cells) {
    const key = cellKey(c);
    if (picked[key] != null || !c.isDefaulted) n += 1;
  }
  return n;
}

export type MealSummaryLine = {
  categoryLabel: string;
  /** Dish names and/or natural portions for display. */
  lines: string[];
};

/** Food-first summary from current effective selections + portions. */
export function buildMealSummary(
  groups: PickCategoryGroup[],
  picked: Record<string, string>,
): MealSummaryLine[] {
  const out: MealSummaryLine[] = [];
  for (const g of groups) {
    const lines: string[] = [];
    if (!g.selectable) {
      const dish = g.cells[0] ? effectiveDishId(g.cells[0], picked) : null;
      const name = g.dishes.find((d) => d.id === dish)?.name ?? g.dishes[0]?.name;
      const portion = g.portions[0];
      if (name && portion) lines.push(`${name} · ${portion}`);
      else if (portion) lines.push(portion);
      else if (name) lines.push(name);
    } else {
      for (let i = 0; i < g.cells.length; i++) {
        const cell = g.cells[i]!;
        const id = effectiveDishId(cell, picked);
        const name = g.dishes.find((d) => d.id === id)?.name;
        const portion = g.portions[i];
        if (name && portion) lines.push(`${name} · ${portion}`);
        else if (name) lines.push(name);
        else if (portion) lines.push(portion);
      }
    }
    if (lines.length) out.push({ categoryLabel: g.label, lines });
  }
  return out;
}

/**
 * Which composition-row cell receives a dish tap. Prefer an untouched default
 * pick; otherwise replace the last pick that isn't already this dish.
 * Never merges pickIndexes — each cell stays a separate composition row.
 */
export function resolveDishTap(
  group: PickCategoryGroup,
  dishId: string,
  picked: Record<string, string>,
): { cell: GridCell; dishId: string } | null {
  if (!group.selectable || group.cells.length === 0) return null;
  const cells = group.cells.filter((c) => c.selectable && !c.locked);
  if (cells.length === 0) return null;

  const untouchedDefault = cells.find((c) => picked[cellKey(c)] == null && c.isDefaulted);
  if (untouchedDefault) return { cell: untouchedDefault, dishId };

  const replaceOther = [...cells].reverse().find((c) => effectiveDishId(c, picked) !== dishId);
  if (replaceOther) return { cell: replaceOther, dishId };

  // Every slot already has this dish — no-op.
  return null;
}

/** Portion blurb for the category header (e.g. "12oz + 8oz"). */
export function portionHeaderHint(portions: (string | null)[]): string | null {
  const alive = portions.filter((p): p is string => Boolean(p && p.trim()));
  if (alive.length === 0) return null;
  const unique = [...new Set(alive)];
  if (unique.length === 1) return unique[0]!;
  return alive.join(" + ");
}
