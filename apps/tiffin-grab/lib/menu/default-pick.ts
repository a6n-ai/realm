// Pure default-pick rules for resolveCategoriesForDay.
//
// Unrestricted plans (non-veg today) share the weekly menu with restricted plans
// (veg), and the kitchen marks one veg curry as isDefault. That would pack every
// non-veg box as paneer unless we override the largest portion slot with a dish
// that no restricted plan is allowed to receive.
export function maxTuPickIndex(
  items: { tuAmount: string | number; sortOrder: number }[],
): number | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  let best = 0;
  let bestTu = Number(sorted[0]!.tuAmount);
  for (let i = 1; i < sorted.length; i++) {
    const tu = Number(sorted[i]!.tuAmount);
    if (tu > bestTu) {
      bestTu = tu;
      best = i;
    }
  }
  return best + 1;
}

export function defaultMenuItem<T extends { dishId: bigint; isDefault: boolean }>(
  slotItems: T[],
  pickIndex: number,
  opts: { exclusiveDishIds: Set<bigint>; maxTuPickIndex: number | null },
): T | undefined {
  if (slotItems.length === 0) return undefined;
  const shared = slotItems.find((i) => i.isDefault) ?? slotItems[0];
  if (opts.maxTuPickIndex !== pickIndex) return shared;
  const exclusive = slotItems.filter((i) => opts.exclusiveDishIds.has(i.dishId));
  if (exclusive.length === 0) return shared;
  return exclusive.find((i) => i.isDefault) ?? exclusive[0];
}
