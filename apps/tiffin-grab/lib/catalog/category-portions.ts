/** First human portion per category — same representative the wizard chips use. */
export function categoryPortionsFromItems(
  items: { category: string; portion: string | null }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    if (item.portion && !(item.category in out)) out[item.category] = item.portion;
  }
  return out;
}

/**
 * All human portions per category in catalog row order (one entry per composition
 * slot). Trip info / Edit meal use this so "3×12oz" never stands in for three rows.
 */
export function categoryPortionSlotsFromItems(
  items: { category: string; portion: string | null }[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const item of items) {
    if (!item.portion) continue;
    const list = out[item.category] ?? [];
    list.push(item.portion);
    out[item.category] = list;
  }
  return out;
}

export function categoryPortionsForMealSize(
  mealSizes: { id: bigint; items: { category: string; portion: string | null }[] }[],
  mealSizeId: bigint,
): Record<string, string> {
  return categoryPortionsFromItems(mealSizes.find((m) => m.id === mealSizeId)?.items ?? []);
}

export function categoryPortionSlotsForMealSize(
  mealSizes: { id: bigint; items: { category: string; portion: string | null }[] }[],
  mealSizeId: bigint,
): Record<string, string[]> {
  return categoryPortionSlotsFromItems(mealSizes.find((m) => m.id === mealSizeId)?.items ?? []);
}
