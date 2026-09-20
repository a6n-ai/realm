// Converts a TU (tiffin unit) amount back into the category's natural unit for
// display — kitchen labels and customer UI show "6 roti" / "12oz", never raw TU.
export type TuCategory = { tuUnitType: "weight" | "count"; tuUnitSize: number; tuUnitLabel: string };

export function tuToNatural(category: TuCategory, tuAmount: number): number {
  const natural = tuAmount * category.tuUnitSize;
  // Weight: one decimal (12.5). Count: whole or half piece — finer than a half isn't servable.
  return category.tuUnitType === "weight"
    ? Math.round(natural * 10) / 10
    : Math.round(natural * 2) / 2;
}

export function formatTuHuman(category: TuCategory, tuAmount: number): string {
  const trimmed = String(Number(tuToNatural(category, tuAmount).toFixed(2)));
  return category.tuUnitType === "weight" ? `${trimmed}${category.tuUnitLabel}` : `${trimmed} ${category.tuUnitLabel}`;
}

/** Customer/wizard chip copy: pick count × category, human portion when known — never raw TU. */
export function mealChipLabel(qty: number, label: string, portion?: string | null): string {
  return portion ? `${qty}× ${label} · ${portion}` : `${qty}× ${label}`;
}
