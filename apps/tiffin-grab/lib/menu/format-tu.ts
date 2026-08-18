// Converts a TU (tiffin unit) amount back into the category's natural unit for
// display — kitchen labels and customer UI show "6 roti" / "12oz", never raw TU.
export type TuCategory = { tuUnitType: "weight" | "count"; tuUnitSize: number; tuUnitLabel: string };

export function formatTuHuman(category: TuCategory, tuAmount: number): string {
  const natural = tuAmount * category.tuUnitSize;
  // Weight: one decimal ("12.5oz"), trailing .0 trimmed. Count: whole or half
  // piece ("6 roti", "2.5 roti") — anything finer than a half isn't servable.
  const rounded = category.tuUnitType === "weight"
    ? Math.round(natural * 10) / 10
    : Math.round(natural * 2) / 2;
  const trimmed = String(Number(rounded.toFixed(2)));
  return category.tuUnitType === "weight" ? `${trimmed}${category.tuUnitLabel}` : `${trimmed} ${category.tuUnitLabel}`;
}
