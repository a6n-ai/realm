/**
 * Shared meal + swap validation (pure). Customer, staff, and applyDeliverySwap
 * all go through these helpers so UI never invents a second set of rules.
 *
 * Composition-row TU (Phase 7):
 *   Each meal_size_items row is one pick with its own tuAmount. Swaps remove the
 *   first N remaining rows of fromCategory (same order as portionsByCategory).
 *   Same-unit swaps (oz ↔ oz) are like-for-like: each given row becomes one
 *   destination pick of the same TU (Sabzi 12oz + 8oz → Daal 12oz + 8oz).
 *   Cross-unit swaps (rice ↔ roti) split the given TU into destination
 *   first-row picks and must divide evenly.
 *
 * The destination must have a row on the meal size (swapPairFits).
 */

import { formatTuHuman } from "./format-tu";
import type {
  HydratedPick,
  MealRule,
  MealRuleCondition,
  MealRuleOperator,
} from "./meal-rule-types";
import { OPERATORS_BY_FIELD } from "./meal-rule-types";
import { ruleText, type RuleLabels } from "./meal-rule-text";
import {
  applySwapsToCounts,
  capViolation,
  sameUnit,
  swapPairFits,
  takeGiven,
  type SlotRow,
  type SwapCategory,
  type SwapRow,
} from "./swap-rules";

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
  rules: MealRule[];
  /**
   * The WHOLE proposed meal for this person/day, every category — not just the
   * category being edited. Rules like "cannot coexist" and dish-name limits span
   * categories, so evaluating one category at a time cannot see them.
   */
  picks: HydratedPick[];
  labels?: Record<string, string>;
  /** Labels for generating a message when a rule has no admin description. */
  ruleLabels?: RuleLabels;
  /**
   * The pick being added/changed right now, when this is a single edit.
   *
   * Whole-meal evaluation means a meal that ALREADY breaks a rule (a rule added
   * after the picks, or picks made before it) would otherwise block every later
   * edit — including edits to unrelated categories, leaving the customer stuck.
   * With a focus pick, a rule can only refuse the edit if the edited pick itself
   * matches that rule: the customer can still change anything else, and can
   * still fix the offending category, but cannot add to or preserve the breach.
   *
   * Omit it to validate a complete meal on its own terms (e.g. a batch check).
   */
  focus?: HydratedPick;
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

/** TU per received pick for a cross-unit swap into `toKey`: its first composition row. */
export function receivePickTu(ctx: CompositionContext, toKey: string): number | null {
  return baseTuSlots(ctx, toKey)[0] ?? ctx.categories.get(toKey)?.pickTu ?? null;
}

/** Per-category TU slots with their base composition row, after folding applied swaps in order. */
export function rowsAfterSwaps(ctx: CompositionContext, applied: SwapRow[]): Map<string, SlotRow<number>[]> {
  const map = new Map<string, SlotRow<number>[]>();
  for (const item of [...ctx.mealSizeItems].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = map.get(item.category) ?? [];
    list.push({ row: list.length, value: item.tuAmount });
    map.set(item.category, list);
  }
  for (const key of Object.keys(ctx.baseCounts)) {
    if (!map.has(key)) map.set(key, []);
  }
  for (const s of applied) {
    const from = map.get(s.fromCategory) ?? [];
    const given = takeGiven(from, s);
    map.set(s.fromCategory, from);

    const to = map.get(s.toCategory) ?? [];
    const fromCat = ctx.categories.get(s.fromCategory);
    const toCat = ctx.categories.get(s.toCategory);
    // Same-unit swaps are like-for-like (validateProposedSwap): keep each given size.
    if (fromCat && toCat && sameUnit(fromCat, toCat) && given.length === s.qtyTo) {
      to.push(...given.map((g) => ({ row: null, value: g.value })));
    } else {
      const rate = receivePickTu(ctx, s.toCategory) ?? 0;
      for (let i = 0; i < s.qtyTo; i++) to.push({ row: null, value: rate });
    }
    map.set(s.toCategory, to);
  }
  return map;
}

/**
 * The first swap that no longer has anything to give, folding `swaps` in order — e.g.
 * Daal → Raita after the Sabzi → Daal it took its Daal from is removed. Null when all apply.
 */
export function firstBrokenSwap(ctx: CompositionContext, swaps: SwapRow[]): SwapRow | null {
  for (let i = 0; i < swaps.length; i++) {
    const s = swaps[i]!;
    const from = rowsAfterSwaps(ctx, swaps.slice(0, i)).get(s.fromCategory) ?? [];
    if (from.length < s.qtyFrom) return s;
    if (s.fromRow != null && !from.some((r) => r.row === s.fromRow)) return s;
  }
  return null;
}

/** Build per-category TU slot lists from composition, then fold applied swaps in order. */
export function slotsAfterSwaps(ctx: CompositionContext, applied: SwapRow[]): Map<string, number[]> {
  return new Map([...rowsAfterSwaps(ctx, applied)].map(([k, rows]) => [k, rows.map((r) => r.value)]));
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

/** Does one pick satisfy one condition? */
export function conditionMatches(c: MealRuleCondition, pick: HydratedPick): boolean {
  // An operator that is not legal for this field cannot be evaluated. Returning
  // false (rather than falling through to a lookalike branch) stops e.g.
  // `category contains "x"` from quietly behaving like `category is "x"`.
  if (!OPERATORS_BY_FIELD[c.field]?.includes(c.operator)) return false;
  switch (c.field) {
    case "dish_plan":
      return inIdSet(c, pick.dishPlanId);
    case "dish":
      return inIdSet(c, pick.dishId);
    case "category":
      return inKeySet(c, pick.category);
    case "dish_name":
      return nameMatches(c, pick.dishName);
    default:
      return false;
  }
}

function negated(op: MealRuleOperator): boolean {
  return op === "is_not" || op === "is_not_one_of" || op === "not_contains";
}

function inIdSet(c: MealRuleCondition, value: bigint): boolean {
  // A condition with no values can never be satisfied; it is rejected at write
  // time, but a stale rule (its dish or plan deleted) must degrade to "no match"
  // rather than blocking every pick.
  const ids = c.valueIds ?? [];
  if (ids.length === 0) return false;
  const hit = ids.some((id) => id === value);
  return negated(c.operator) ? !hit : hit;
}

function inKeySet(c: MealRuleCondition, value: string): boolean {
  const keys = c.valueKeys ?? [];
  if (keys.length === 0) return false;
  const hit = keys.includes(value);
  return negated(c.operator) ? !hit : hit;
}

function nameMatches(c: MealRuleCondition, name: string): boolean {
  const needle = (c.valueText ?? "").trim().toLowerCase();
  if (!needle) return false;
  const hay = name.toLowerCase();
  switch (c.operator) {
    case "contains":
      return hay.includes(needle);
    case "not_contains":
      return !hay.includes(needle);
    case "equals":
      return hay === needle;
    case "starts_with":
      return hay.startsWith(needle);
    case "ends_with":
      return hay.endsWith(needle);
    default:
      return false;
  }
}

/**
 * Matching is PER PICK: a rule's conditions are evaluated against one pick at a
 * time, then the matching picks are counted. This is what makes `is_not`
 * intuitive — "Diet is not Veg" marks each non-veg pick, rather than asking
 * whether the meal as a whole contains a non-veg dish.
 */
export function pickMatchesRule(rule: MealRule, pick: HydratedPick): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.matchMode === "any"
    ? rule.conditions.some((c) => conditionMatches(c, pick))
    : rule.conditions.every((c) => conditionMatches(c, pick));
}

export type MealRuleFailure = { ok: false; reason: string; rulePublicId: string };

export function validateMealRules(ctx: MealRuleContext): { ok: true } | MealRuleFailure {
  // Deterministic message when several rules could fire on the same pick.
  const rules = [...ctx.rules].sort((a, b) => b.priority - a.priority || a.publicId.localeCompare(b.publicId));

  for (const rule of rules) {
    // See `focus` above: an edit that cannot make this rule worse is not its business.
    if (ctx.focus && !pickMatchesRule(rule, ctx.focus)) continue;

    const matching = ctx.picks.filter((p) => pickMatchesRule(rule, p));
    if (matching.length === 0) continue;

    const fail = (): MealRuleFailure => ({
      ok: false,
      reason: ruleText(rule, ctx.ruleLabels),
      rulePublicId: rule.publicId,
    });

    switch (rule.action) {
      case "forbid":
        return fail();
      case "cannot_coexist": {
        // Distinct dishes: picking the same dish twice is a quantity question
        // (owned by max picks per category), not a coexistence violation.
        const distinct = new Set(matching.map((p) => p.dishId));
        if (distinct.size > 1) return fail();
        break;
      }
      case "max_qualifying": {
        const cap = rule.actionValue ?? 0;
        if (matching.length > cap) return fail();
        break;
      }
      default: {
        const _exhaustive: never = rule.action;
        void _exhaustive;
      }
    }
  }
  return { ok: true };
}

export type ValidateSwapInput = {
  composition: CompositionContext;
  applied: SwapRow[];
  /** fromRow: the base row given up (one pick); omit for the leading `fromPicks` rows. */
  next: { fromCategory: string; toCategory: string; fromPicks: number; fromRow?: number | null };
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

  const opposing = applied.find(
    (s) => s.fromCategory === next.toCategory && s.toCategory === next.fromCategory,
  );
  if (opposing) {
    return {
      ok: false,
      reason: `An exchange between ${labelOf(next.toCategory, composition.labels)} and ${labelOf(next.fromCategory, composition.labels)} is already applied for this day. Undo the existing exchange to change it.`,
    };
  }

  const fromRows = rowsAfterSwaps(composition, applied).get(next.fromCategory) ?? [];
  if (fromRows.length < next.fromPicks) {
    return {
      ok: false,
      reason: `Not enough ${labelOf(next.fromCategory, composition.labels)} left to give up on this day.`,
    };
  }
  if (next.fromRow != null) {
    if (next.fromPicks !== 1) return { ok: false, reason: "Swap one item at a time." };
    if (!fromRows.some((r) => r.row === next.fromRow)) {
      return { ok: false, reason: `That ${labelOf(next.fromCategory, composition.labels)} is already swapped on this day.` };
    }
  }

  const giveTu = sumTu(takeGiven([...fromRows], { qtyFrom: next.fromPicks, fromRow: next.fromRow }).map((r) => r.value));
  let qtyTo: number;
  let getTu: number;
  if (sameUnit(from, to)) {
    qtyTo = next.fromPicks;
    getTu = giveTu;
  } else {
    const toRate = receivePickTu(composition, next.toCategory);
    if (toRate == null || toRate <= 0) {
      return { ok: false, reason: "This swap requires an even portion exchange." };
    }
    const ratio = giveTu / toRate;
    if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
      return { ok: false, reason: "This swap requires an even portion exchange." };
    }
    qtyTo = Math.round(ratio);
    getTu = qtyTo * toRate;
  }

  const proposed: SwapRow = {
    fromCategory: next.fromCategory,
    toCategory: next.toCategory,
    qtyFrom: next.fromPicks,
    qtyTo,
    fromRow: next.fromRow ?? null,
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

function naturalForSlots(cat: SwapCategory, slots: number[]): string | null {
  const parts = slots.map((tu) => naturalForTu(cat, tu));
  return parts.every((p) => p != null) ? parts.join(" + ") : null;
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

  const opposing = applied.find(
    (s) => s.fromCategory === toCategory && s.toCategory === fromCategory,
  );
  if (opposing) {
    return {
      fromCategory,
      toCategory,
      available: false,
      reason: `An exchange between ${labelOf(toCategory, composition.labels)} and ${labelOf(fromCategory, composition.labels)} is already applied for this day. Undo the existing exchange to change it.`,
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

  const slots = slotsAfterSwaps(composition, applied);
  const fromSlots = slots.get(fromCategory) ?? [];
  const uniformSlots = fromSlots.length <= 1 || fromSlots.every((tu) => Math.abs(tu - fromSlots[0]!) < 1e-9);

  const bundles: SwapBundle[] = [];
  let firstFail: string | null = null;
  for (let q = 1; q <= have; q++) {
    // When 1 source item already produces a valid integer exchange and all available source slots
    // have uniform TU, do not expose redundant multi-item bundles (q > 1) on slot-based UIs.
    if (q > 1 && uniformSlots && bundles.some((b) => b.fromPicks === 1)) {
      break;
    }
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
      // Same-unit swaps move whole containers: "12oz + 8oz", never a summed "20oz".
      giveNatural: sameUnit(from, to) ? naturalForSlots(from, fromSlots.slice(0, q)) : naturalForTu(from, r.giveTu),
      getNatural: sameUnit(from, to) ? naturalForSlots(to, fromSlots.slice(0, q)) : naturalForTu(to, r.getTu),
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
