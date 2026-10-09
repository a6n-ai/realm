// Kitchen packing-sheet cell copy: portion + unit from the catalog converter, times how
// many containers of that dish@portion go in the box. Never invents units — callers pass
// the already-formatted portion string from formatPortion / portionForPick ("12oz", "4 roti").

import { formatTuHuman, tuToNatural, type TuCategory } from "@/lib/menu/format-tu";

export type PortionQty = { portion: string; quantity: number };

export type PackingItemLine = {
  name: string;
  /** Pack size label from formatTuHuman ("4 roti", "1 unit") or oz for weight. */
  portion: string;
  /** Pack/container count (the old × multiplier). */
  quantity: number;
  /** Stable pack order (category sort, then pick index). */
  sort: number;
  /**
   * Count categories: cell = packSize × packCount as a plain total ("4 roti" × 2 → "Roti — 8").
   * `countWord` (the category label) keys the line and the kitchen summary's unit column.
   */
  packStyle?: "count-total";
  countWord?: string;
};

/** "12oz" → "12 OZ", "4 roti" → "4 roti" — portion/unit only, no quantity. */
export function formatPortionUnit(portion: string): string {
  const trimmed = portion.trim();
  if (!trimmed) return "";
  const weight = /^(\d+(?:\.\d+)?)\s*oz$/i.exec(trimmed);
  if (weight) return `${weight[1]} OZ`;
  return trimmed;
}

/** "12oz" × 1 → "12 OZ"; "8oz" × 2 → "8 OZ × 2". */
export function formatPackingRequirement(portion: string, quantity: number): string {
  const unit = formatPortionUnit(portion);
  if (!unit || quantity <= 0) return "";
  return quantity === 1 ? unit : `${unit} × ${quantity}`;
}

/** Count concept: pack size × pack count → plain total. "4 roti" × 2 → 8; "1 unit" × 2 → 2. */
export function countTotalFromPack(portion: string, quantity: number): number {
  if (quantity <= 0) return 0;
  const amount = Number(/^(\d+(?:\.\d+)?)/.exec(portion.trim())?.[1] ?? 1);
  return Number(((amount > 0 ? amount : 1) * quantity).toFixed(2));
}

/**
 * One pack-size label per composition slot (for count merge on ×).
 * `wrapSlots` mirrors sumTuForPicks when there are no swaps.
 */
export function countPackSlotPortions(
  slots: (number | null)[],
  pickCount: number,
  converter: TuCategory,
  wrapSlots: boolean,
): string[] {
  if (slots.length === 0 || pickCount <= 0) return [];
  const n = wrapSlots ? pickCount : Math.min(pickCount, slots.length);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const slotTu = slots[wrapSlots ? i % slots.length : i];
    const tu = slotTu == null ? 0 : slotTu;
    if (tu <= 0) continue;
    out.push(formatTuHuman(converter, tu));
  }
  return out;
}

/** Natural total for kitchen summary: same slots × pickCount as countPackSlotPortions. */
export function countPackNaturalTotal(
  slots: (number | null)[],
  pickCount: number,
  converter: TuCategory,
  wrapSlots: boolean,
): number {
  if (slots.length === 0 || pickCount <= 0) return 0;
  const n = wrapSlots ? pickCount : Math.min(pickCount, slots.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const slotTu = slots[wrapSlots ? i % slots.length : i];
    const tu = slotTu == null ? 0 : slotTu;
    if (tu <= 0) continue;
    total += tuToNatural(converter, tu);
  }
  return total;
}

/** Identity helper for summary-style joins that already pass pre-merged lines. */
export function rollUpEqualPortions(portions: PortionQty[]): PortionQty[] {
  return portions;
}

/** Item cell, one shape for every dish: count → "Roti — 8" / "Veg Pulao" (one); weight → "Dal — 8 OZ" / "Dal — 8 OZ × 2". */
export function formatItemCell(
  line: Pick<PackingItemLine, "name" | "portion" | "quantity" | "packStyle">,
): string {
  const total = line.packStyle === "count-total" ? countTotalFromPack(line.portion, line.quantity) : 0;
  const req =
    line.packStyle === "count-total"
      ? (total > 1 ? String(total) : "")
      : formatPackingRequirement(line.portion, line.quantity);
  const name = line.name.trim();
  if (!name) return req || "—";
  return req ? `${name} — ${req}` : name;
}

/**
 * Label card / PDF lines in the packing-sheet shape: repeat containers of one dish@portion
 * merge into "Dal — 8 OZ × 2"; a count line ("8 roti") reads "Roti — 8", a single one just "Veg Pulao".
 */
export function labelLineTexts(
  lines: { dish: string; portion: string | null; count?: boolean; addon?: boolean; defaulted: boolean }[],
): { text: string; defaulted: boolean }[] {
  const merged: { line: (typeof lines)[number]; quantity: number; defaulted: boolean }[] = [];
  for (const line of lines) {
    const hit = merged.find((m) => m.line.dish === line.dish && m.line.portion === line.portion && !!m.line.count === !!line.count && !!m.line.addon === !!line.addon);
    if (hit) {
      hit.quantity += 1;
      hit.defaulted &&= line.defaulted;
    } else merged.push({ line, quantity: 1, defaulted: line.defaulted });
  }
  return merged.map(({ line, quantity, defaulted }) => ({
    text: formatItemCell({
      name: line.addon ? `${line.dish} (add-on)` : line.dish,
      portion: line.portion ?? "",
      quantity,
      ...(line.count ? { packStyle: "count-total" as const } : {}),
    }),
    defaulted,
  }));
}

/** @deprecated Prefer formatItemCell; kept for summary-style portion-only joins. */
export function formatDishCell(portions: PortionQty[]): string {
  const parts = rollUpEqualPortions(
    portions.filter((p) => p.quantity > 0 && p.portion.trim()),
  )
    .sort((a, b) => a.portion.localeCompare(b.portion))
    .map((p) => formatPackingRequirement(p.portion, p.quantity));
  return parts.length > 0 ? parts.join("; ") : "—";
}

/** Merge pick counts keyed by dish → portion label (Kitchen Summary). */
export function addDishPortion(
  into: Map<string, Map<string, number>>,
  dish: string,
  portion: string | null,
  qty = 1,
): void {
  if (!dish || qty <= 0) return;
  const portionKey = (portion ?? "").trim() || "portion";
  let byPortion = into.get(dish);
  if (!byPortion) {
    byPortion = new Map();
    into.set(dish, byPortion);
  }
  byPortion.set(portionKey, (byPortion.get(portionKey) ?? 0) + qty);
}
