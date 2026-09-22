/**
 * Pure Admin configuration guards (Phase 8). Deterministic blocking checks only —
 * no category-name hardcoding, no speculative warnings. Services throw ValidationError
 * with these messages; historical delivery data is never rewritten here.
 */

export type CompositionGuardItem = {
  category: string;
  tuAmount: string | number;
  maxTuAmount?: string | number | null;
};

/** Max TU is a post-swap ceiling on category total — it must not sit below the base composition. */
export function maxTuBelowBaseMessage(items: CompositionGuardItem[]): string | null {
  const byCat = new Map<string, { base: number; ceiling: number | null }>();
  for (const item of items) {
    const tu = Number(item.tuAmount);
    if (!Number.isFinite(tu)) continue;
    const cur = byCat.get(item.category) ?? { base: 0, ceiling: null };
    cur.base += tu;
    if (item.maxTuAmount != null && item.maxTuAmount !== "") {
      const cap = Number(item.maxTuAmount);
      if (Number.isFinite(cap)) {
        cur.ceiling = cur.ceiling == null ? cap : Math.max(cur.ceiling, cap);
      }
    }
    byCat.set(item.category, cur);
  }
  for (const [category, { base, ceiling }] of byCat) {
    if (ceiling == null) continue;
    if (ceiling + 1e-9 < base) {
      return `Max TU for ${category} (${ceiling}) is below the base composition (${base}). Raise Max TU or reduce the composition.`;
    }
  }
  return null;
}

export function unknownPlanCategoryMessage(category: string): string {
  return `Category "${category}" is not available on this meal size's plan.`;
}

export function disabledCategoryMessage(category: string): string {
  return `Category "${category}" is disabled or not found.`;
}

export function emptyActiveCompositionMessage(): string {
  return "An active meal size needs at least one composition row.";
}

export function invalidMealRuleMaxMessage(): string {
  return "Maximum must be a whole number of 1 or more.";
}

export function mealRuleCategoryMessage(categoryKey: string): string {
  return `Category "${categoryKey}" is not available on this plan.`;
}
