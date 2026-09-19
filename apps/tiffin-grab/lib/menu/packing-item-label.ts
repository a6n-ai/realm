// Packing-sheet item cell: the kitchen Excel has a separate Qty column, but packers
// read the name first — so the portion lives in the name. Weight slots (sabzi/daal/
// raita/salad) show each pick's oz; count slots (rice/roti) show the piece total
// ("Jeera Rice 1", "Roti 8"), not "1 unit" repeated once per roti line.

export function packingItemLabel(
  picks: { name: string }[],
  portions: (string | null)[],
  qty: number,
  unitType: "weight" | "count" | undefined,
): string {
  if (picks.length === 0) return "";
  if (unitType === "count") {
    return `${picks[0]!.name} ${qty}`;
  }
  return picks
    .map((p, i) => {
      const portion = portions[i];
      return portion ? `${p.name} ${portion}` : p.name;
    })
    .join(", ");
}
