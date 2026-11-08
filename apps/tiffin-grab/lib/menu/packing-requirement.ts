// The kitchen's one packing language. Container labels (PDF + on-screen), the Excel
// packing sheet and the kitchen counts all word an item through this file, so they
// cannot drift:
//
//   Weight (sabzi, daal, raita, salad): "Dish - 8oz"; repeats stack "Dish - 8oz × 2".
//     A portion bigger than the 12oz container that is a whole number of 8oz is packed
//     as 8oz containers: 16oz reads "Dish - 8oz × 2" (splitContainers).
//   Count (roti, rice): one total for the box, number first: "5 Rotis". Every slot and
//     add-on of the same dish folds into it ("Roti 2" + "Roti 1" → "3 Rotis"). A single
//     piece is just the dish ("Veg Pulao").
//   Add-on weight lines keep a "(add-on)" tag; add-on counts fold into the total.
//
// Never invents units — callers pass portion strings from portionForPick ("12oz", "4 roti").

import { tuToNatural, type TuCategory } from "@/lib/menu/format-tu";

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
   * Count categories: cell = packSize × packCount as a plain total ("4 roti" × 2 → "8 Rotis").
   * `countWord` (the category label) keys the line and the kitchen summary's unit column.
   */
  packStyle?: "count-total";
  countWord?: string;
};

const OZ = /^(\d+(?:\.\d+)?)\s*oz$/i;
const LARGEST_CONTAINER_OZ = 12;
const SMALL_CONTAINER_OZ = 8;

/** "12 OZ" → "12oz", "4 roti" → "4 roti" — portion/unit only, no quantity. */
export function formatPortionUnit(portion: string): string {
  const trimmed = portion.trim();
  if (!trimmed) return "";
  const weight = OZ.exec(trimmed);
  if (weight) return `${weight[1]}oz`;
  return trimmed;
}

/** The containers one weight portion is packed in: "16oz" → ["8oz", "8oz"]; anything else stays whole. */
export function splitContainers(portion: string): string[] {
  const oz = Number(OZ.exec(portion.trim())?.[1]);
  if (!(oz > LARGEST_CONTAINER_OZ) || oz % SMALL_CONTAINER_OZ !== 0) return [portion];
  return Array.from({ length: oz / SMALL_CONTAINER_OZ }, () => `${SMALL_CONTAINER_OZ}oz`);
}

/** "5 Rotis", "2 Jeera Rice", or the dish alone when it is one piece. */
export function formatCountTotal(name: string, total: number): string {
  if (total <= 1) return name;
  return `${total} ${/roti$/i.test(name) ? `${name}s` : name}`;
}

/** A portion on its own, as the kitchen counts card shows it: "12oz", "8 Rotis", "2 Rice", "Rice". */
export function formatPortionLabel(dish: string, portion: string | null): string {
  if (!portion) return "—";
  if (OZ.test(portion.trim())) return formatPortionUnit(portion);
  const n = Number(/^(\d+(?:\.\d+)?)/.exec(portion.trim())?.[1]);
  return Number.isFinite(n) ? formatCountTotal(dish, n) : portion;
}

/** "12oz" × 1 → "12oz"; "8oz" × 2 → "8oz × 2". */
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

/** Natural pieces for a count category across its slots ("8" roti); `wrapSlots` mirrors sumTuForPicks when there are no swaps. */
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

/** Item cell, one shape for every dish: count → "8 Rotis" / "Veg Pulao" (one); weight → "Dal - 8oz" / "Dal - 8oz × 2". */
export function formatItemCell(
  line: Pick<PackingItemLine, "name" | "portion" | "quantity" | "packStyle">,
): string {
  const name = line.name.trim();
  if (line.packStyle === "count-total") return formatCountTotal(name, countTotalFromPack(line.portion, line.quantity)) || "—";
  const req = formatPackingRequirement(line.portion, line.quantity);
  if (!name) return req || "—";
  return req ? `${name} - ${req}` : name;
}

type PackLine = { dish: string; portion: string | null; count?: boolean; addon?: boolean; defaulted: boolean };

/**
 * One tiffin's lines in packing terms, before anything counts or prints them: a count dish
 * becomes one line holding the box total (add-on roti folded in), and an oversize weight
 * portion becomes the 8oz containers it is packed in. Labels and kitchen counts both read this.
 */
export function packLines<T extends PackLine>(lines: T[]): T[] {
  const out: T[] = [];
  for (const line of lines) {
    if (line.count) {
      const amount = countTotalFromPack(line.portion ?? "", 1);
      const hit = out.find((o) => o.count && o.dish === line.dish);
      if (!hit) {
        out.push({ ...line, addon: undefined, portion: withAmount(line.portion, amount) });
        continue;
      }
      hit.portion = withAmount(hit.portion, countTotalFromPack(hit.portion ?? "", 1) + amount);
      hit.defaulted &&= line.defaulted;
      continue;
    }
    if (!line.portion) {
      out.push(line);
      continue;
    }
    for (const portion of splitContainers(line.portion)) out.push({ ...line, portion });
  }
  return out;
}

/** "2 roti" with 3 → "3 roti"; keeps the unit word. */
function withAmount(portion: string | null, amount: number): string {
  const unit = /^\d+(?:\.\d+)?\s*(.*)$/.exec((portion ?? "").trim())?.[1] ?? "";
  return unit ? `${amount} ${unit}` : String(amount);
}

/** Label card / PDF lines in the packing-sheet shape: repeat containers merge into "Dal - 8oz × 2". */
export function labelLineTexts(lines: PackLine[]): { text: string; defaulted: boolean }[] {
  const merged: { line: PackLine; quantity: number; defaulted: boolean }[] = [];
  for (const line of packLines(lines)) {
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
