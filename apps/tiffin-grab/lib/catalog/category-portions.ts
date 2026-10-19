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

/**
 * Row add-ons (an extra sabzi) are slots after the meal's own, at the add-on's own portion: without
 * them a 12oz add-on fell back to the meal's last slot and read 8oz. Folded add-ons (roti) are a
 * separate total, not a slot.
 */
export function categoryPortionSlotsForMealSize(
  mealSizes: { id: bigint; items: { category: string; portion: string | null }[] }[],
  mealSizeId: bigint,
  addons: { category: string; qty: number; folded: boolean; portion: string | null }[] = [],
): Record<string, string[]> {
  const items = [...(mealSizes.find((m) => m.id === mealSizeId)?.items ?? [])];
  for (const a of addons) if (!a.folded) for (let i = 0; i < a.qty; i++) items.push({ category: a.category, portion: a.portion });
  return categoryPortionSlotsFromItems(items);
}
