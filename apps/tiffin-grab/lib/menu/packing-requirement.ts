// Kitchen packing-sheet cell copy: portion + unit from the catalog converter, times how
// many containers of that dish@portion go in the box. Never invents units — callers pass
// the already-formatted portion string from formatPortion / portionForPick ("12oz", "4 roti").

export type PortionQty = { portion: string; quantity: number };

export type PackingItemLine = {
  name: string;
  portion: string;
  quantity: number;
  /** Stable pack order (category sort, then pick index). */
  sort: number;
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

/**
 * Kitchen UX choice: how to show N identical count-slots.
 * Identity keeps "1 roti × 8"; roll-up would yield "8 roti × 1".
 */
export function rollUpEqualPortions(portions: PortionQty[]): PortionQty[] {
  return portions;
}

/** Item cell: dish name + converted portion×qty — "Chicken Curry — 12 OZ × 1". */
export function formatItemCell(line: Pick<PackingItemLine, "name" | "portion" | "quantity">): string {
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
