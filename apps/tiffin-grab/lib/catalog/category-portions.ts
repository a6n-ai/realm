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

export function categoryPortionsForMealSize(
  mealSizes: { id: bigint; items: { category: string; portion: string | null }[] }[],
  mealSizeId: bigint,
): Record<string, string> {
  return categoryPortionsFromItems(mealSizes.find((m) => m.id === mealSizeId)?.items ?? []);
}
