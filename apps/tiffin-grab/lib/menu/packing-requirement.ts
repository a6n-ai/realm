// Kitchen packing-sheet cell copy: portion + unit from the catalog converter, times how
// many containers of that dish@portion go in the box. Never invents units — callers pass
// the already-formatted portion string from formatPortion / portionForPick ("12oz", "4 roti").

export type PortionQty = { portion: string; quantity: number };

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

/**
 * Kitchen UX choice: how to show N identical count-slots.
 *
 * Today callers may pass `{ portion: "1 roti", quantity: 8 }` → "1 roti × 8".
 * Some kitchens prefer a rolled total `{ portion: "8 roti", quantity: 1 }` → "8 roti × 1".
 *
 * Return `portions` unchanged to keep per-slot form, or roll count-units into a single total.
 */
export function rollUpEqualPortions(portions: PortionQty[]): PortionQty[] {
  // TODO: implement kitchen preference (identity vs roll-up). See formatDishCell caller.
  return portions;
}

/** One dish cell may carry several portion sizes (e.g. 12oz and 8oz of the same curry). */
export function formatDishCell(portions: PortionQty[]): string {
  const parts = rollUpEqualPortions(
    portions.filter((p) => p.quantity > 0 && p.portion.trim()),
  )
    .sort((a, b) => a.portion.localeCompare(b.portion))
    .map((p) => formatPackingRequirement(p.portion, p.quantity));
  return parts.length > 0 ? parts.join("; ") : "—";
}

/** Merge pick counts keyed by dish → portion label. */
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
