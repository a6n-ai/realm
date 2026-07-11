// "N needed" hint for the menu builder: the max qty any meal size in the
// plan-type asks for, per category. Retired plans.category_counts was a
// hand-authored guess at this; meal_size_items is the actual source of
// truth for how much of each category an order can need.
export function maxQtyByCategory(items: { category: string; qty: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    if (i.qty > (out[i.category] ?? 0)) out[i.category] = i.qty;
  }
  return out;
}
