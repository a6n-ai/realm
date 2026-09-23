// "N needed" hint for the menu builder: the max number of rows any single meal
// size has in a (category, plan) slot. A veg and a non-veg meal size (or two
// items on the same meal size targeting different plans) can ask for different
// counts in the same category, so this is keyed by slot, not category alone —
// meal_size_items is the source of truth.
export function maxQtyBySlot(
  items: { mealSizeId: bigint; category: string; planId: bigint }[],
  planPublicById: Map<bigint, string>,
): Record<string, number> {
  const perMealSize = new Map<string, number>();
  for (const i of items) {
    const key = `${i.mealSizeId}:${i.category}:${i.planId}`;
    perMealSize.set(key, (perMealSize.get(key) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const [key, count] of perMealSize) {
    const [, category, planIdStr] = key.split(":");
    const planPublicId = planPublicById.get(BigInt(planIdStr));
    if (!planPublicId) continue;
    const slotKey = `${category}|${planPublicId}`;
    if (count > (out[slotKey] ?? 0)) out[slotKey] = count;
  }
  return out;
}
