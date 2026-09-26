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

export type SwapRow = { fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number };

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
  /**
   * All composition-row TUs in catalog sortOrder (e.g. Sabzi 1.5 + 1.0).
   * Applied-swap labels front-splice these so "Exchanges today" matches meal columns —
   * not fromPicks × first-row pickTu.
   */
  slotTu?: number[];
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
  const ratio = (fromPicks * fromTu) / toTu;
  // Epsilon, not `%`: TU amounts are decimals (0.25 roti) and float modulo lies.
  if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
    // Customer-facing: never mention pick counts / TU math. Valid-options must
    // filter these quantities before the UI offers them.
    return { ok: false, reason: "This swap requires an even portion exchange." };
  }
  return { ok: true, qtyTo: Math.round(ratio) };
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

function formatSlotNatural(cat: SwapCategory | undefined, tus: number[]): string | null {
  if (!cat?.unitSize || tus.length === 0) return null;
  const parts = tus.map((tu) =>
    formatTuHuman({ tuUnitType: cat.unitType, tuUnitSize: cat.unitSize!, tuUnitLabel: cat.unitLabel }, tu),
  );
  return parts.join(" + ");
}

function workingSlots(cats: Record<string, SwapCategory>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [key, cat] of Object.entries(cats)) {
    if (cat.slotTu && cat.slotTu.length > 0) out.set(key, [...cat.slotTu]);
    else if (cat.pickTu != null) out.set(key, [cat.pickTu]);
    else out.set(key, []);
  }
  return out;
}

/**
 * Human give/get for each applied swap in order, using the same front-splice
 * like-for-like rules as meal columns. Prefer this over swapLabel when labeling
 * a stack of applied swaps (heterogeneous Sabzi 12oz+8oz → two Daal chips).
 */
export function appliedSwapAmounts(
  swaps: SwapRow[],
  cats: Record<string, SwapCategory> | undefined,
): ({ give: string; get: string } | null)[] {
  if (!cats || swaps.length === 0) return swaps.map(() => null);

  const slots = workingSlots(cats);
  const catalogFirst = new Map<string, number | null>();
  for (const [key, list] of slots) catalogFirst.set(key, list[0] ?? cats[key]?.pickTu ?? null);

  return swaps.map((s) => {
    const fromCat = cats[s.fromCategory];
    const toCat = cats[s.toCategory];
    const from = slots.get(s.fromCategory) ?? [];
    const given = from.splice(0, s.qtyFrom);
    slots.set(s.fromCategory, from);

    const to = slots.get(s.toCategory) ?? [];
    let received: number[];
    if (fromCat && toCat && sameUnit(fromCat, toCat) && given.length === s.qtyTo) {
      received = given;
      to.push(...given);
    } else {
      const rate = catalogFirst.get(s.toCategory) ?? toCat?.pickTu ?? null;
      received = rate == null ? [] : Array.from({ length: s.qtyTo }, () => rate);
      to.push(...received);
    }
    slots.set(s.toCategory, to);

    const give = formatSlotNatural(fromCat, given);
    const get =
      fromCat && toCat && sameUnit(fromCat, toCat)
        ? formatSlotNatural(toCat, received)
        : swapAmounts(fromCat, toCat, s.qtyFrom, s.qtyTo)?.get ?? formatSlotNatural(toCat, received);
    if (give && get) return { give, get };

    // Incomplete slot data — fall back to first-row pickTu math for this row only.
    return swapAmounts(fromCat, toCat, s.qtyFrom, s.qtyTo);
  });
}

/** Labels for an applied swap stack; each chip uses the slot sizes that swap actually moved. */
export function labelAppliedSwaps(
  swaps: SwapRow[],
  label: (key: string) => string,
  cats?: Record<string, SwapCategory>,
): string[] {
  const amounts = appliedSwapAmounts(swaps, cats);
  return swaps.map((s, i) => {
    const a = amounts[i];
    return a
      ? `${label(s.fromCategory)} · ${a.give} → ${label(s.toCategory)} · ${a.get}`
      : swapLabel(s, label, cats);
  });
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
