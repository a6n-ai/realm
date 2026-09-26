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
      chooseCount: mine[0]!.selectable || mine.length > 1 ? mine.length : mine[0]!.quantity,
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
      if (g.portions.length > 1) {
        for (let i = 0; i < g.portions.length; i++) {
          const cell = g.cells[i] ?? g.cells[0];
          const dish = cell ? effectiveDishId(cell, picked) : null;
          const name = g.dishes.find((d) => d.id === dish)?.name ?? g.dishes[0]?.name;
          const portion = g.portions[i];
          if (name && portion) lines.push(`${name} · ${portion}`);
          else if (name) lines.push(name);
          else if (portion) lines.push(portion);
        }
      } else {
        const dish = g.cells[0] ? effectiveDishId(g.cells[0], picked) : null;
        const name = g.dishes.find((d) => d.id === dish)?.name ?? g.dishes[0]?.name;
        const portion = g.portions[0];
        if (name && portion) lines.push(`${name} · ${portion}`);
        else if (portion) lines.push(portion);
        else if (name) lines.push(name);
      }
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

export type AnchoredSwap = {
  publicId: string;
  fromCategory: string;
  toCategory: string;
  qtyFrom: number;
  qtyTo: number;
  pending: boolean;
};

/** A composition row the customer exchanged — rendered where the row was, not under the new category. */
export type SwappedRow = {
  swap: AnchoredSwap;
  /** What the row was ("12oz"). */
  givePortion: string | null;
  /** What it became ("12oz"). */
  getPortion: string | null;
  /** Cells the swap added to toCategory; they get their dish pickers inside this row. */
  toCells: GridCell[];
  toDishes: GridCell["dishes"];
};

export type AnchoredGroup = PickCategoryGroup & { swapped: SwappedRow[] };

/**
 * Keep each exchanged row in its original category, in place. Swaps front-splice
 * fromCategory and append to toCategory, so the given rows are the leading base
 * portions and the received cells are toCategory's trailing per-pick cells.
 */
export function anchorSwaps(args: {
  groups: PickCategoryGroup[];
  swaps: AnchoredSwap[];
  categories: PickCategoryMeta[];
  /** Base (pre-swap) portions per category. */
  basePortions: Record<string, (string | null)[]>;
  /** Amounts for bulk rows (roti count) where per-row portions don't exist. */
  amounts: (s: AnchoredSwap) => { give: string; get: string } | null;
}): AnchoredGroup[] {
  const { groups, swaps, categories, basePortions, amounts } = args;
  const byKey = new Map<string, AnchoredGroup>(
    groups.map((g) => [g.key, { ...g, cells: [...g.cells], portions: [...g.portions], swapped: [] }]),
  );
  for (const s of swaps) {
    if (byKey.has(s.fromCategory)) continue;
    const meta = categories.find((c) => c.key === s.fromCategory);
    if (!meta) continue;
    byKey.set(meta.key, {
      key: meta.key, label: meta.label, selectable: meta.selectable, chooseCount: 0,
      cells: [], portions: [], dishes: [], swapped: [],
    });
  }

  // Newest swap owns the newest trailing cells.
  const received = new Map<string, { cells: GridCell[]; portions: (string | null)[] }>();
  for (const s of [...swaps].reverse()) {
    const to = byKey.get(s.toCategory);
    const perPick = to && to.cells.length >= s.qtyTo && to.cells.every((c) => c.quantity === 1);
    if (!to || !perPick) {
      received.set(s.publicId, { cells: [], portions: [] });
      continue;
    }
    const at = to.cells.length - s.qtyTo;
    received.set(s.publicId, { cells: to.cells.splice(at), portions: to.portions.splice(at) });
  }

  const consumed = new Map<string, number>();
  for (const s of swaps) {
    const from = byKey.get(s.fromCategory);
    if (!from) continue;
    const start = consumed.get(s.fromCategory) ?? 0;
    consumed.set(s.fromCategory, start + s.qtyFrom);
    const base = (basePortions[s.fromCategory] ?? []).slice(start, start + s.qtyFrom);
    const got = received.get(s.publicId)!;
    const amt = amounts(s);
    const give = base.length === s.qtyFrom && base.every(Boolean) ? base.join(" + ") : amt?.give ?? null;
    const get = got.portions.length && got.portions.every(Boolean) ? got.portions.join(" + ") : amt?.get ?? null;
    from.swapped.push({
      swap: s,
      givePortion: give,
      getPortion: get,
      toCells: got.cells,
      toDishes: got.cells[0]?.dishes ?? byKey.get(s.toCategory)?.dishes ?? [],
    });
  }

  const order = new Map(categories.map((c) => [c.key, c.sortOrder]));
  return [...byKey.values()]
    .filter((g) => g.cells.length > 0 || g.swapped.length > 0)
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}
