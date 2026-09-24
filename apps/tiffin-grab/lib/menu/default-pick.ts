// Pure default-pick rules for resolveCategoriesForDay.
import type { HydratedPick, MealRule } from "./meal-rule-types";
import { validateMealRules } from "./meal-validation";

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

type RuleItem = { dishId: bigint; name: string; planId: bigint; publicId: string };
type ResolvedLike = {
  category: string;
  picks: { dishId: bigint; dishPublicId: string; name: string; isDefaulted: boolean }[];
};

/**
 * Defaults never break a meal rule. A customer's own pick was validated when saved,
 * but a default — including the slot a swap just added — is chosen here, so it gets
 * the same check against the rest of the meal. A failing default moves to the first
 * menu dish of that slot that passes; with none, it stays (the meal can't be fixed
 * from this slot, and an empty slot would pack nothing).
 */
export function keepDefaultsWithinRules<C extends ResolvedLike>(
  resolved: C[],
  slotItemsFor: (category: string) => RuleItem[],
  rules: MealRule[],
): C[] {
  if (rules.length === 0) return resolved;
  const byId = new Map<bigint, RuleItem>();
  for (const c of resolved) for (const it of slotItemsFor(c.category)) byId.set(it.dishId, it);
  const hydrate = (category: string, it: RuleItem): HydratedPick => ({
    dishId: it.dishId, dishName: it.name, dishPlanId: it.planId, category,
  });

  // Defaults settle in order against the customer's picks plus defaults settled before
  // them — so of two Chicken defaults the first stays and only the second moves.
  const settled = new Set<object>();
  for (const c of resolved) {
    c.picks.forEach((p, idx) => {
      if (!p.isDefaulted) return;
      const others = resolved.flatMap((o) =>
        o.picks.flatMap((q) => {
          const it = !q.isDefaulted || settled.has(q) ? byId.get(q.dishId) : undefined;
          return it ? [hydrate(o.category, it)] : [];
        }),
      );
      const passes = (it: RuleItem) => {
        const focus = hydrate(c.category, it);
        return validateMealRules({ rules, picks: [...others, focus], focus }).ok;
      };
      const current = byId.get(p.dishId);
      const alt = !current || passes(current) ? undefined : slotItemsFor(c.category).find(passes);
      const final = alt ? { dishId: alt.dishId, dishPublicId: alt.publicId, name: alt.name, isDefaulted: true } : p;
      c.picks[idx] = final;
      settled.add(final);
    });
  }
  return resolved;
}
