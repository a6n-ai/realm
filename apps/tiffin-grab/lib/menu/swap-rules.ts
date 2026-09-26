// Pure rules for a per-delivery category swap, shared by the apply path
// (category-swaps.service.ts) and the picker's pair list (dish-categories.service.ts)
// so the drawer never offers a swap the server then refuses.
//
// A swap target does not have to be in the meal size's composition: a non-veg 4-item
// thali is Curry + Daal, and trading its curry for a sabzi is the whole point. A pick
// of the missing side is priced as the present side's portion (8oz curry -> 8oz sabzi),
// which is only meaningful when both are measured in the same unit — so roti -> rice
// on a meal size without rice is never offered.

import { formatTuHuman } from "./format-tu";

export type SwapRow = {
  fromCategory: string;
  toCategory: string;
  qtyFrom: number;
  qtyTo: number;
  /** Base composition row given up (see delivery_category_swaps.from_row); null = first remaining. */
  fromRow?: number | null;
};

/** One slot of a category; `row` is its base composition row, null when a swap brought it in. */
export type SlotRow<T> = { row: number | null; value: T };

/**
 * Removes the slots a swap gives up — the row the customer picked, or the leading
 * slots when the swap names no row. Every fold (TU checks, portions, labels, kitchen)
 * goes through here so they agree on which container left.
 */
export function takeGiven<T>(from: SlotRow<T>[], s: { qtyFrom: number; fromRow?: number | null }): SlotRow<T>[] {
  const at = s.fromRow == null ? 0 : from.findIndex((x) => x.row === s.fromRow);
  // A row that is already gone falls back to the front so counts still match applySwapsToCounts.
  return from.splice(Math.max(at, 0), s.qtyFrom);
}

/**
 * Folds applied swaps onto per-category slots, in order. The one received-row rule every
 * reader shares (swap options, apply validation, Edit meal, portions, labels, kitchen):
 * a same-unit swap keeps each given size; otherwise each received pick is `receiveTu(to)`.
 * Mutates and returns `slots`.
 */
export function foldSwaps<T>(
  slots: Map<string, SlotRow<T>[]>,
  swaps: SwapRow[],
  rules: { sameUnit: (from: string, to: string) => boolean; receiveTu: (to: string) => T },
): Map<string, SlotRow<T>[]> {
  for (const s of swaps) {
    const from = slots.get(s.fromCategory) ?? [];
    const given = takeGiven(from, s);
    slots.set(s.fromCategory, from);

    const to = slots.get(s.toCategory) ?? [];
    if (rules.sameUnit(s.fromCategory, s.toCategory) && given.length === s.qtyTo) {
      to.push(...given.map((g) => ({ row: null, value: g.value })));
    } else {
      const tu = rules.receiveTu(s.toCategory);
      for (let i = 0; i < s.qtyTo; i++) to.push({ row: null, value: tu });
    }
    slots.set(s.toCategory, to);
  }
  return slots;
}

// Folds every applied swap for a delivery onto a base counts map, in the order the
// rows are given. Never clamps below 0 here — that's a service-layer invariant
// enforced at apply-time (applyDeliverySwap), not re-validated on every read. Lives in
// this db-free module so the client day picker folds swaps exactly like the server.
export function applySwapsToCounts(counts: Record<string, number>, swaps: SwapRow[]): Record<string, number> {
  if (swaps.length === 0) return counts;
  const next = { ...counts };
  for (const s of swaps) {
    next[s.fromCategory] = (next[s.fromCategory] ?? 0) - s.qtyFrom;
    next[s.toCategory] = (next[s.toCategory] ?? 0) + s.qtyTo;
  }
  return next;
}

export type SwapCategory = {
  key: string;
  // Per-pick TU from this meal size's composition; null when the meal size has no row for it.
  pickTu: number | null;
  unitType: "weight" | "count";
  unitLabel: string;
  maxPicksPerTiffin: number | null;
  /** How many natural units one TU is (tu_unit_size); needed to show oz/roti instead of raw TU. */
  unitSize?: number;
};

/** Same natural unit (oz ↔ oz): each given pick becomes one received pick of the same TU. */
export function sameUnit(from: SwapCategory, to: SwapCategory): boolean {
  return from.unitType === to.unitType && from.unitLabel === to.unitLabel;
}

// The destination must be on this meal size — a Sabzi Only meal can't swap into Salad.
// The from side may be absent only when it was received by an earlier same-unit swap.
export function swapPairFits(from: SwapCategory, to: SwapCategory): boolean {
  if (to.pickTu == null) return false;
  return from.pickTu != null || sameUnit(from, to);
}

export function swapQuantities(
  from: SwapCategory,
  to: SwapCategory,
  fromPicks: number,
): { ok: true; qtyTo: number } | { ok: false; reason: string } {
  if (!swapPairFits(from, to)) return { ok: false, reason: `${from.key} can't be swapped for ${to.key} on this meal size` };
  if (sameUnit(from, to)) return { ok: true, qtyTo: fromPicks };
  const fromTu = from.pickTu ?? to.pickTu!;
  const toTu = to.pickTu ?? from.pickTu!;
  const qtyTo = crossUnitPicks(fromPicks * fromTu, toTu);
  // Customer-facing: never mention pick counts / TU math.
  if (qtyTo < 1) return { ok: false, reason: NOT_ENOUGH_FOR_SWAP };
  return { ok: true, qtyTo };
}

export const NOT_ENOUGH_FOR_SWAP = "Not enough to swap for a full portion.";

/**
 * Cross-unit swaps (roti ↔ rice) receive whole destination picks, rounded down:
 * 6 roti (1.5 TU) → 1 rice. The remainder is forfeited. The epsilon absorbs float
 * error on decimal TU (0.25 × 4 must floor to 1, not 0).
 */
export function crossUnitPicks(giveTu: number, toTu: number): number {
  return toTu > 0 ? Math.floor(giveTu / toTu + 1e-9) : 0;
}

/** One line of category_swap_pairs.exchange_overrides: give this portion, receive that one (TU). */
export type ExchangeOverride = { giveTu: number; receiveTu: number };

/** The pair's override for a given portion, or null when that portion has no line. */
export function exchangeOverride(overrides: ExchangeOverride[] | undefined, giveTu: number): number | null {
  return overrides?.find((o) => Math.abs(o.giveTu - giveTu) < 1e-9)?.receiveTu ?? null;
}

/**
 * Received TU for one given portion: the pair's override when it has a line for that
 * portion, else the natural exchange (same unit keeps the size; cross-unit rounds down
 * to whole destination picks). Null when a cross-unit portion buys no whole pick.
 * Depends only on the portion and the pair's rules, never on the rest of the meal.
 */
export function receiveTuFor(args: {
  sameUnit: boolean;
  giveTu: number;
  /** TU of one destination pick; only used by the cross-unit natural exchange. */
  toPickTu: number;
  overrides?: ExchangeOverride[];
}): number | null {
  const hit = exchangeOverride(args.overrides, args.giveTu);
  if (hit != null) return hit;
  if (args.sameUnit) return args.giveTu;
  const picks = crossUnitPicks(args.giveTu, args.toPickTu);
  return picks < 1 ? null : picks * args.toPickTu;
}

/** Reason the effective counts break `to`'s per-tiffin cap, or null when within it. */
export function capViolation(effectiveCounts: Record<string, number>, to: SwapCategory): string | null {
  if (to.maxPicksPerTiffin == null) return null;
  const picks = effectiveCounts[to.key] ?? 0;
  return picks > to.maxPicksPerTiffin ? `At most ${to.maxPicksPerTiffin} ${to.key} per tiffin` : null;
}

/** Human amounts of a swap ("6oz", "4 roti") from per-pick TU; null when the category unit size is unknown. */
export function swapAmounts(
  from: SwapCategory | undefined,
  to: SwapCategory | undefined,
  qtyFrom: number,
  qtyTo: number,
): { give: string; get: string } | null {
  if (!from?.unitSize || !to?.unitSize) return null;
  const fromTu = from.pickTu ?? to.pickTu;
  const toTu = to.pickTu ?? from.pickTu;
  if (fromTu == null || toTu == null) return null;
  const fmt = (c: SwapCategory, tu: number) => formatTuHuman({ tuUnitType: c.unitType, tuUnitSize: c.unitSize!, tuUnitLabel: c.unitLabel }, tu);
  const giveTu = qtyFrom * fromTu;
  return { give: fmt(from, giveTu), get: fmt(to, sameUnit(from, to) ? giveTu : qtyTo * toTu) };
}

/** "Rice 6oz → Roti 4 roti"; falls back to pick counts when units are unknown. */
export function swapLabel(s: SwapRow, label: (key: string) => string, cats?: Record<string, SwapCategory>): string {
  const a = swapAmounts(cats?.[s.fromCategory], cats?.[s.toCategory], s.qtyFrom, s.qtyTo);
  return a ? `${label(s.fromCategory)} · ${a.give} → ${label(s.toCategory)} · ${a.get}` : `${s.qtyFrom} ${label(s.fromCategory)} → ${s.qtyTo} ${label(s.toCategory)}`;
}

/** True when some give-count in 1..availableFromPicks divides evenly into the destination (pair-fit only). */
export function hasEvenPortionSwap(
  from: SwapCategory | undefined,
  to: SwapCategory | undefined,
  availableFromPicks: number,
): boolean {
  if (availableFromPicks < 1) return false;
  if (!from || !to) return true;
  for (let q = 1; q <= availableFromPicks; q++) {
    if (swapQuantities(from, to, q).ok) return true;
  }
  return false;
}

/** Side note for a swap option: the smallest whole swap in real units ("8oz ⇄ 8oz", "4 roti ⇄ 1 unit"); "" when none fits. */
export function smallestSwapNote(from: SwapCategory | undefined, to: SwapCategory | undefined): string {
  if (!from || !to) return "";
  for (let q = 1; q <= 8; q++) {
    const r = swapQuantities(from, to, q);
    if (r.ok) {
      const a = swapAmounts(from, to, q, r.qtyTo);
      return a ? `${a.give} ⇄ ${a.get}` : "";
    }
  }
  return "";
}
