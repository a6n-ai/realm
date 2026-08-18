// "N needed" hint for the menu builder: the max number of rows any single meal
// size in the plan-type has in a category (a row is one dish pick). Retired
// plans.category_counts was a hand-authored guess at this; meal_size_items is
// the actual source of truth for how much of each category an order can need.
export function maxQtyByCategory(items: { mealSizeId: bigint; category: string }[]): Record<string, number> {
  const perMealSize = new Map<string, number>();
  for (const i of items) {
    const key = `${i.mealSizeId}:${i.category}`;
    perMealSize.set(key, (perMealSize.get(key) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const [key, count] of perMealSize) {
    const category = key.slice(key.indexOf(":") + 1);
    if (count > (out[category] ?? 0)) out[category] = count;
  }
  return out;
}
