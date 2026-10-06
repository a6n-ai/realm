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
   * Count categories: cell = packSize × packCount as a plain total ("4 roti" × 2 → "8 rotis").
   * `countWord` is the display unit ("roti", "rice") — never generic "unit".
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

/** Normalize "12oz" / "4 roti" into kitchen scan form: "12 OZ × 1", "4 roti × 2". */
export function formatPackingRequirement(portion: string, quantity: number): string {
  const unit = formatPortionUnit(portion);
  if (!unit || quantity <= 0) return "";
  return `${unit} × ${quantity}`;
}

/** Pluralize count unit words for packing cells: 1 roti, 8 rotis, 2 rice. */
export function pluralizeCountWord(n: number, word: string): string {
  const base = word.trim().toLowerCase();
  if (!base) return "";
  if (n === 1) return base;
  if (base === "rice" || base.endsWith("s")) return base;
  if (base === "roti") return "rotis";
  return `${base}s`;
}

/** Count packing cell: "8 rotis", "2 rice", "1 roti". */
export function formatCountTotal(n: number, word: string): string {
  if (n <= 0) return "";
  const trimmed = String(Number(n.toFixed(2)));
  const label = pluralizeCountWord(n, word);
  return label ? `${trimmed} ${label}` : trimmed;
}

/**
 * Count concept: pack size × pack count → plain total.
 * "4 roti" × 2 → "8 rotis"; "1 unit" × 2 with countWord "rice" → "2 rice".
 */
export function formatCountFromPack(portion: string, quantity: number, countWord: string): string {
  if (quantity <= 0) return "";
  const word = (countWord || "").trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(portion.trim());
  if (!m) return formatCountTotal(quantity, word || portion);
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return formatCountTotal(quantity, word || portion);
  return formatCountTotal(amount * quantity, word || m[2] || portion);
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

/** Item cell: weight → "… — 12 OZ × 1"; count → packSize × qty as "8 rotis" / "2 rice". */
export function formatItemCell(
  line: Pick<PackingItemLine, "name" | "portion" | "quantity" | "packStyle" | "countWord">,
): string {
  if (line.packStyle === "count-total") {
    return (
      formatCountFromPack(line.portion, line.quantity, line.countWord ?? line.portion) ||
      line.name.trim() ||
      "—"
    );
  }
  const req = formatPackingRequirement(line.portion, line.quantity);
  if (!line.name.trim()) return req || "—";
  return req ? `${line.name} — ${req}` : line.name;
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
