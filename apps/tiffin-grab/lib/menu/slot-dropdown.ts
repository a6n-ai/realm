/**
 * Per-composition-row options for the customer Edit meal sheet (radio list).
 * Dish picks stay same-category; swap entries come only from backend validBundles.
 *
 * Swaps front-splice fromCategory rows, so exchange options are live only on the
 * first remaining cell of that category (index 0); later rows show them greyed.
 */

import { validateMealRules, type SwapOption } from "./meal-validation";
import type { HydratedPick, MealRule } from "./meal-rule-types";
import type { GridDish } from "./meals-grid";

function hydrate(category: string, dish: GridDish): HydratedPick | null {
  if (!dish.ruleId || !dish.planId) return null;
  return { dishId: BigInt(dish.ruleId), dishName: dish.name, dishPlanId: BigInt(dish.planId), category };
}

/**
 * The dishes one cell may switch to without breaking a meal rule, given every other
 * pick in that meal — the same focus check setSelection runs on save, so the sheet
 * never offers a pick the server would refuse (e.g. a second non-veg Sabzi).
 * The current pick always stays, so a meal already over a limit still renders.
 */
export function dishesAllowedByRules<D extends GridDish>(args: {
  rules: MealRule[];
  category: string;
  dishes: D[];
  selectedId: string | null;
  others: { category: string; dish: GridDish }[];
}): D[] {
  const { rules, category, dishes, selectedId, others } = args;
  if (rules.length === 0) return dishes;
  const rest = others.flatMap((o) => hydrate(o.category, o.dish) ?? []);
  return dishes.filter((d) => {
    if (d.id === selectedId) return true;
    const focus = hydrate(category, d);
    if (!focus) return true;
    return validateMealRules({ rules, picks: [...rest, focus], focus }).ok;
  });
}

/**
 * Swap bundles whose new slots can each still be filled with a dish from that day's
 * menu without breaking a meal rule (e.g. no swap into a Chicken-only category when
 * the meal already has its one Chicken dish). The given picks leave first, in the
 * same front order the swap removes them. A category with no menu dishes is not a
 * rule question, so it is left alone.
 */
export function swapOptionsAllowedByRules(args: {
  rules: MealRule[];
  options: SwapOption[];
  /** Current picks of the meal, each category in pickIndex order. */
  mealPicks: { category: string; dish: GridDish }[];
  menuByCategory: Map<string, GridDish[]>;
}): SwapOption[] {
  const { rules, options, mealPicks, menuByCategory } = args;
  if (rules.length === 0) return options;

  const fillable = (from: string, fromPicks: number, to: string, toPicks: number): boolean => {
    const menu = menuByCategory.get(to) ?? [];
    if (menu.length === 0) return true;
    let given = 0;
    const picks = mealPicks.flatMap((p) => {
      if (p.category === from && given < fromPicks) {
        given++;
        return [];
      }
      return hydrate(p.category, p.dish) ?? [];
    });
    for (let i = 0; i < toPicks; i++) {
      const fit = menu
        .map((d) => hydrate(to, d))
        .find((focus) => !focus || validateMealRules({ rules, picks: [...picks, focus], focus }).ok);
      if (fit === undefined) return false;
      if (fit) picks.push(fit);
    }
    return true;
  };

  return options.flatMap((o) => {
    const validBundles = o.validBundles.filter((b) => fillable(o.fromCategory, b.fromPicks, o.toCategory, b.toPicks));
    return validBundles.length ? [{ ...o, validBundles }] : [];
  });
}

type SlotOptionState = {
  /** Shown greyed out: the customer can see the choice but not make it. */
  disabled?: boolean;
  /** Second line under the label ("Choose this instead", or why it's greyed out). */
  note?: string;
};

export type SlotDishOption = SlotOptionState & {
  kind: "dish";
  value: string;
  label: string;
  dishId: string;
};

export type SlotSwapOption = SlotOptionState & {
  kind: "swap";
  value: string;
  label: string;
  fromCategory: string;
  toCategory: string;
  fromPicks: number;
};

export type SlotDropdownOption = SlotDishOption | SlotSwapOption;

export function dishOptionValue(dishId: string): string {
  return `dish:${dishId}`;
}

export function swapOptionValue(fromCategory: string, toCategory: string, fromPicks: number): string {
  return `swap:${fromCategory}>${toCategory}:${fromPicks}`;
}

export function parseSlotOptionValue(value: string):
  | { kind: "dish"; dishId: string }
  | { kind: "swap"; fromCategory: string; toCategory: string; fromPicks: number }
  | null {
  if (value.startsWith("dish:")) {
    const dishId = value.slice("dish:".length);
    return dishId ? { kind: "dish", dishId } : null;
  }
  if (value.startsWith("swap:")) {
    const body = value.slice("swap:".length);
    const colon = body.lastIndexOf(":");
    if (colon < 0) return null;
    const pair = body.slice(0, colon);
    const fromPicks = Number(body.slice(colon + 1));
    const gt = pair.indexOf(">");
    if (gt < 0 || !Number.isInteger(fromPicks) || fromPicks < 1) return null;
    const fromCategory = pair.slice(0, gt);
    const toCategory = pair.slice(gt + 1);
    if (!fromCategory || !toCategory) return null;
    return { kind: "swap", fromCategory, toCategory, fromPicks };
  }
  return null;
}

function swapLabel(
  toLabel: string,
  bundle: { fromPicks: number; getNatural: string | null },
): string {
  const get = bundle.getNatural ? ` · ${bundle.getNatural}` : "";
  if (bundle.fromPicks <= 1) return `${toLabel}${get}`;
  return `${toLabel}${get} · uses ${bundle.fromPicks} items`;
}

/**
 * Options for one composition row. `cellIndexInCategory` is 0-based among the
 * remaining cells of that category (pickIndex order).
 *
 * Nothing the admin configured is hidden: a dish or swap the customer can't take
 * right now comes back `disabled` with a note, so the row never changes shape.
 */
export function buildSlotDropdownOptions(args: {
  cellIndexInCategory: number;
  categoryKey: string;
  dishes: readonly { id: string; name: string }[];
  /** Dishes a meal rule refuses beside the other picks. */
  disabledDishIds?: ReadonlySet<string>;
  swapOptions: readonly SwapOption[];
  /** `swapOptionValue`s a meal rule allows; omit to allow every available bundle. */
  allowedSwaps?: ReadonlySet<string>;
  /**
   * One pick per row (Sabzi 12oz, Sabzi 8oz): each row swaps itself only, so
   * multi-row bundles ("uses 2 items") are left out. Bulk rows (8 roti) keep them.
   */
  onePerRow?: boolean;
  categoryLabel: (key: string) => string;
}): SlotDropdownOption[] {
  const { cellIndexInCategory, categoryKey, dishes, disabledDishIds, swapOptions, allowedSwaps, onePerRow, categoryLabel } = args;
  const out: SlotDropdownOption[] = [];

  for (const d of dishes) {
    const blocked = disabledDishIds?.has(d.id) ?? false;
    out.push({
      kind: "dish",
      value: dishOptionValue(d.id),
      label: d.name,
      dishId: d.id,
      ...(blocked ? { disabled: true, note: "Not allowed with your other picks" } : {}),
    });
  }

  for (const opt of swapOptions) {
    if (opt.fromCategory !== categoryKey) continue;
    const toLabel = categoryLabel(opt.toCategory);
    const base = { kind: "swap" as const, fromCategory: opt.fromCategory, toCategory: opt.toCategory };
    const bundles = opt.validBundles.filter((b) => !onePerRow || b.fromPicks === 1);
    if (!opt.available || bundles.length === 0) {
      out.push({
        ...base, fromPicks: 1, value: swapOptionValue(opt.fromCategory, opt.toCategory, 1), label: toLabel,
        disabled: true, note: opt.reason ?? "Not available for this item",
      });
      continue;
    }
    // Swaps take the leading row of a category, so later rows wait their turn.
    if (cellIndexInCategory !== 0) {
      out.push({
        ...base, fromPicks: 1, value: swapOptionValue(opt.fromCategory, opt.toCategory, 1), label: toLabel,
        disabled: true, note: `Swap the ${categoryLabel(categoryKey)} above first`,
      });
      continue;
    }
    for (const bundle of bundles) {
      const ok = !allowedSwaps || allowedSwaps.has(swapOptionValue(opt.fromCategory, opt.toCategory, bundle.fromPicks));
      out.push({
        ...base,
        fromPicks: bundle.fromPicks,
        value: swapOptionValue(opt.fromCategory, opt.toCategory, bundle.fromPicks),
        label: swapLabel(toLabel, bundle),
        disabled: !ok || undefined,
        note: ok ? "Choose this instead" : "Not allowed with your other picks",
      });
    }
  }

  return out;
}

/** True when admin swap pairs expose at least one live bundle from this category. */
export function hasOutgoingSwapOptions(
  categoryKey: string,
  swapOptions: readonly SwapOption[],
): boolean {
  return swapOptions.some(
    (o) => o.available && o.fromCategory === categoryKey && o.validBundles.length > 0,
  );
}
