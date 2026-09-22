/**
 * Shared meal + swap validation (pure). Customer, staff, and applyDeliverySwap
 * all go through these helpers so UI never invents a second set of rules.
 *
 * Composition-row TU (Phase 7):
 *   Each meal_size_items row is one pick with its own tuAmount. Swaps remove the
 *   first N remaining rows of fromCategory (same order as portionsByCategory) and
 *   append destination picks at the destination's first-row TU. Never multiply
 *   fromPicks × first-row pickTu when rows differ (e.g. Sabzi 1.5+1.0 ≠ 2×1.5).
 *
 * pickTu on SwapCategory remains the first-row rate for pair-fit / absent-side
 * fallbacks and single-row meals (unchanged behavior).
 */

import { formatTuHuman } from "./format-tu";
import {
  applySwapsToCounts,
  capViolation,
  swapPairFits,
  type SwapCategory,
  type SwapRow,
} from "./swap-rules";

export type MealRuleRow = {
  categoryKey: string;
  condition: "exclusive_to_plan";
  maxCount: number;
};

export type MealSizeItemRow = {
  category: string;
  tuAmount: number;
  maxTuAmount: number | null;
  sortOrder: number;
};

export type ProposedDishPick = {
  category: string;
  /** Dish id (internal bigint as string or number — compared via Set membership). */
  dishId: bigint;
};

export type CompositionContext = {
  /** Snapshot categoryCounts on the order (pre-swap base). */
  baseCounts: Record<string, number>;
  mealSizeItems: MealSizeItemRow[];
  /** key → SwapCategory (includes pickTu, maxPicksPerTiffin, units). */
  categories: Map<string, SwapCategory>;
  /** Human labels for categories (optional). */
  labels?: Record<string, string>;
};

export type MealRuleContext = {
  rules: MealRuleRow[];
  /** Dish ids that match exclusive_to_plan for this order's plan. */
  exclusiveDishIds: Set<bigint>;
  /** Optional category → dish ids currently selected (for rule checks). */
  picks: ProposedDishPick[];
  labels?: Record<string, string>;
};

function labelOf(key: string, labels?: Record<string, string>): string {
  return labels?.[key] ?? key;
}

function sumTu(slots: number[]): number {
  return slots.reduce((s, t) => s + t, 0);
}

/** Ordered base TU slots for a category from meal_size_items (sortOrder). */
export function baseTuSlots(ctx: CompositionContext, category: string): number[] {
  return ctx.mealSizeItems
    .filter((i) => i.category === category)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => i.tuAmount);
}

/**
 * TU per received pick when swapping into `toKey`: destination's first composition
 * row, else its pickTu, else the from-side first row / pickTu (absent-side swaps).
 */
export function receivePickTu(ctx: CompositionContext, toKey: string, fromKey: string): number | null {
  const toBase = baseTuSlots(ctx, toKey);
  if (toBase.length) return toBase[0]!;
  const to = ctx.categories.get(toKey);
  if (to?.pickTu != null) return to.pickTu;
  const fromBase = baseTuSlots(ctx, fromKey);
  if (fromBase.length) return fromBase[0]!;
  return ctx.categories.get(fromKey)?.pickTu ?? null;
}

/** Build per-category TU slot lists from composition, then fold applied swaps in order. */
export function slotsAfterSwaps(ctx: CompositionContext, applied: SwapRow[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const item of [...ctx.mealSizeItems].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = map.get(item.category) ?? [];
    list.push(item.tuAmount);
    map.set(item.category, list);
  }
  for (const key of Object.keys(ctx.baseCounts)) {
    if (!map.has(key)) map.set(key, []);
  }
  for (const s of applied) {
    const from = map.get(s.fromCategory) ?? [];
    from.splice(0, s.qtyFrom);
    map.set(s.fromCategory, from);

    const to = map.get(s.toCategory) ?? [];
    const rate = receivePickTu(ctx, s.toCategory, s.fromCategory) ?? 0;
    for (let i = 0; i < s.qtyTo; i++) to.push(rate);
    map.set(s.toCategory, to);
  }
  return map;
}

/**
 * TU total for a category after swaps.
 * Prefer `applied` when known (accurate through add+remove). Count-only path uses
 * front-remove / first-row-append semantics on the base composition.
 */
export function resultingCategoryTu(
  ctx: CompositionContext,
  category: string,
  effectiveCounts: Record<string, number>,
  applied?: SwapRow[],
): number {
  if (applied && applied.length > 0) {
    return sumTu(slotsAfterSwaps(ctx, applied).get(category) ?? []);
  }
  const base = baseTuSlots(ctx, category);
  const n = effectiveCounts[category] ?? 0;
  if (n <= 0) return 0;
  const rate = base[0] ?? ctx.categories.get(category)?.pickTu ?? 0;
  if (n <= base.length) {
    // Front-remove (base.length - n) rows → keep the trailing n base rows.
    return sumTu(base.slice(base.length - n));
  }
  return sumTu(base) + (n - base.length) * rate;
}

/** Configured Max TU for a category (any composition row that sets it). */
export function maxTuForCategory(items: MealSizeItemRow[], category: string): number | null {
  let max: number | null = null;
  for (const i of items) {
    if (i.category !== category || i.maxTuAmount == null) continue;
    max = max == null ? i.maxTuAmount : Math.max(max, i.maxTuAmount);
  }
  return max;
}

export function maxTuViolation(
  ctx: CompositionContext,
  category: string,
  effectiveCounts: Record<string, number>,
  applied: SwapRow[] = [],
): string | null {
  const cap = maxTuForCategory(ctx.mealSizeItems, category);
  if (cap == null) return null;
  const resulting = resultingCategoryTu(ctx, category, effectiveCounts, applied);
  if (resulting <= cap + 1e-9) return null;
  const name = labelOf(category, ctx.labels);
  return `This swap would exceed the maximum ${name} allowed in this meal.`;
}

export function validateMealRules(ctx: MealRuleContext): { ok: true } | { ok: false; reason: string } {
  for (const rule of ctx.rules) {
    if (rule.condition !== "exclusive_to_plan") {
      const _exhaustive: never = rule.condition;
      void _exhaustive;
      continue;
    }
    const matching = ctx.picks.filter(
      (p) => p.category === rule.categoryKey && ctx.exclusiveDishIds.has(p.dishId),
    ).length;
    if (matching > rule.maxCount) {
      const name = labelOf(rule.categoryKey, ctx.labels);
      return {
        ok: false,
        reason: `You can select only ${rule.maxCount} ${name.toLowerCase()} exclusive to this plan in this meal.`,
      };
    }
  }
  return { ok: true };
}

export type ValidateSwapInput = {
  composition: CompositionContext;
  applied: SwapRow[];
  next: { fromCategory: string; toCategory: string; fromPicks: number };
};

export type ValidateSwapResult =
  | { ok: true; qtyTo: number; effective: Record<string, number>; giveTu: number; getTu: number }
  | { ok: false; reason: string };

/**
 * Authoritative single-swap check using actual composition-row TU:
 * pair-fit → give TU (front N slots) → integer receive picks → stack → maxPicks → Max TU.
 */
export function validateProposedSwap(input: ValidateSwapInput): ValidateSwapResult {
  const { composition, applied, next } = input;
  const from = composition.categories.get(next.fromCategory);
  const to = composition.categories.get(next.toCategory);
  if (!from || !to) {
    return { ok: false, reason: "Both categories must be part of this plan" };
  }
  if (!swapPairFits(from, to)) {
    return { ok: false, reason: `${from.key} can't be swapped for ${to.key} on this meal size` };
  }

  const slots = slotsAfterSwaps(composition, applied);
  const fromSlots = slots.get(next.fromCategory) ?? [];
  if (fromSlots.length < next.fromPicks) {
    return {
      ok: false,
      reason: `Not enough ${labelOf(next.fromCategory, composition.labels)} left to give up on this day.`,
    };
  }

  const giveTu = sumTu(fromSlots.slice(0, next.fromPicks));
  const toRate = receivePickTu(composition, next.toCategory, next.fromCategory);
  if (toRate == null || toRate <= 0) {
    return { ok: false, reason: "This swap requires an even portion exchange." };
  }

  const ratio = giveTu / toRate;
  if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
    return { ok: false, reason: "This swap requires an even portion exchange." };
  }
  const qtyTo = Math.round(ratio);
  const getTu = qtyTo * toRate;

  const proposed: SwapRow = {
    fromCategory: next.fromCategory,
    toCategory: next.toCategory,
    qtyFrom: next.fromPicks,
    qtyTo,
  };

  const available = applySwapsToCounts(composition.baseCounts, applied);
  if ((available[next.fromCategory] ?? 0) < next.fromPicks) {
    return {
      ok: false,
      reason: `Not enough ${labelOf(next.fromCategory, composition.labels)} left to give up on this day.`,
    };
  }

  const appliedNext = [...applied, proposed];
  const effective = applySwapsToCounts(composition.baseCounts, appliedNext);

  const pickCap = capViolation(effective, to);
  if (pickCap) {
    return {
      ok: false,
      reason: `You can have at most ${to.maxPicksPerTiffin} ${labelOf(to.key, composition.labels)} in this meal.`,
    };
  }

  const tuCap = maxTuViolation(composition, next.toCategory, effective, appliedNext);
  if (tuCap) return { ok: false, reason: tuCap };

  return { ok: true, qtyTo, effective, giveTu, getTu };
}

export type SwapBundle = {
  fromPicks: number;
  toPicks: number;
  giveNatural: string | null;
  getNatural: string | null;
};

export type SwapOption = {
  fromCategory: string;
  toCategory: string;
  available: boolean;
  reason: string | null;
  /** Valid fromPicks only — never includes quantities that fail divisibility or caps. */
  validBundles: SwapBundle[];
  minFromPicks: number | null;
  maxFromPicks: number | null;
  /** Step between consecutive valid fromPicks when uniform; null if irregular or empty. */
  bundleIncrement: number | null;
  /** Natural amounts for the smallest valid bundle (convenience). */
  giveNatural: string | null;
  getNatural: string | null;
};

function bundleIncrement(fromPicks: number[]): number | null {
  if (fromPicks.length < 2) return fromPicks.length === 1 ? fromPicks[0]! : null;
  const gaps: number[] = [];
  for (let i = 1; i < fromPicks.length; i++) gaps.push(fromPicks[i]! - fromPicks[i - 1]!);
  const first = gaps[0]!;
  return gaps.every((g) => g === first) ? first : null;
}

function naturalForTu(cat: SwapCategory | undefined, tu: number): string | null {
  if (!cat?.unitSize) return null;
  return formatTuHuman(
    { tuUnitType: cat.unitType, tuUnitSize: cat.unitSize, tuUnitLabel: cat.unitLabel },
    tu,
  );
}

/**
 * All valid exchange bundles for one directional pair on the current meal stack.
 * Pairs with zero valid bundles are returned as available:false with a reason.
 */
export function computeSwapOption(args: {
  composition: CompositionContext;
  applied: SwapRow[];
  fromCategory: string;
  toCategory: string;
}): SwapOption {
  const { composition, applied, fromCategory, toCategory } = args;
  const from = composition.categories.get(fromCategory);
  const to = composition.categories.get(toCategory);

  if (!from || !to) {
    return {
      fromCategory,
      toCategory,
      available: false,
      reason: "Both categories must be part of this plan",
      validBundles: [],
      minFromPicks: null,
      maxFromPicks: null,
      bundleIncrement: null,
      giveNatural: null,
      getNatural: null,
    };
  }

  const have = applySwapsToCounts(composition.baseCounts, applied)[fromCategory] ?? 0;
  if (have < 1) {
    return {
      fromCategory,
      toCategory,
      available: false,
      reason: `No ${labelOf(fromCategory, composition.labels)} left to give up on this day.`,
      validBundles: [],
      minFromPicks: null,
      maxFromPicks: null,
      bundleIncrement: null,
      giveNatural: null,
      getNatural: null,
    };
  }

  const bundles: SwapBundle[] = [];
  let firstFail: string | null = null;
  for (let q = 1; q <= have; q++) {
    const r = validateProposedSwap({
      composition,
      applied,
      next: { fromCategory, toCategory, fromPicks: q },
    });
    if (!r.ok) {
      firstFail ??= r.reason;
      continue;
    }
    bundles.push({
      fromPicks: q,
      toPicks: r.qtyTo,
      giveNatural: naturalForTu(from, r.giveTu),
      getNatural: naturalForTu(to, r.getTu),
    });
  }

  if (bundles.length === 0) {
    return {
      fromCategory,
      toCategory,
      available: false,
      reason: firstFail ?? "This swap requires an even portion exchange.",
      validBundles: [],
      minFromPicks: null,
      maxFromPicks: null,
      bundleIncrement: null,
      giveNatural: null,
      getNatural: null,
    };
  }

  const fromPicks = bundles.map((b) => b.fromPicks);
  const smallest = bundles[0]!;
  return {
    fromCategory,
    toCategory,
    available: true,
    reason: null,
    validBundles: bundles,
    minFromPicks: fromPicks[0]!,
    maxFromPicks: fromPicks[fromPicks.length - 1]!,
    bundleIncrement: bundleIncrement(fromPicks),
    giveNatural: smallest.giveNatural,
    getNatural: smallest.getNatural,
  };
}

export function computeAllSwapOptions(args: {
  composition: CompositionContext;
  applied: SwapRow[];
  pairs: { fromCategory: string; toCategory: string }[];
  /** When true, omit unavailable options (customer default). */
  hideUnavailable?: boolean;
}): SwapOption[] {
  const options = args.pairs.map((p) =>
    computeSwapOption({
      composition: args.composition,
      applied: args.applied,
      fromCategory: p.fromCategory,
      toCategory: p.toCategory,
    }),
  );
  return args.hideUnavailable ? options.filter((o) => o.available) : options;
}

/** Format helper for tests / admin read-only conversion notes. */
export function naturalTuNote(cat: SwapCategory, tu: number): string {
  if (!cat.unitSize) return `${tu} TU`;
  return formatTuHuman(
    { tuUnitType: cat.unitType, tuUnitSize: cat.unitSize, tuUnitLabel: cat.unitLabel },
    tu,
  );
}
