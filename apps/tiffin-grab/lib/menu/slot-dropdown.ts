/**
 * Per-composition-row options for the customer Edit meal sheet (radio list).
 * Dish picks stay same-category; swap entries come only from backend validBundles.
 *
 * A per-pick row (Sabzi 12oz, Sabzi 8oz) swaps itself by naming its base row. A
 * bulk row (8 roti) has no row identity, so its bundles take the leading slots.
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
  /** Why it's greyed out. */
  reason?: string;
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
  /** Base row this swap gives up; null = the leading row(s). */
  fromRow: number | null;
  /** The dish picked for what the swap brings, when the destination is a category with a choice. */
  toDishId: string | null;
};

export type SlotDropdownOption = SlotDishOption | SlotSwapOption;

export function dishOptionValue(dishId: string): string {
  return `dish:${dishId}`;
}

export function swapOptionValue(fromCategory: string, toCategory: string, fromPicks: number, fromRow?: number | null, toDishId?: string | null): string {
  return `swap:${fromCategory}>${toCategory}:${fromPicks}${fromRow == null ? "" : `@${fromRow}`}${toDishId ? `~${toDishId}` : ""}`;
}

export function parseSlotOptionValue(value: string):
  | { kind: "dish"; dishId: string }
  | { kind: "swap"; fromCategory: string; toCategory: string; fromPicks: number; fromRow: number | null; toDishId: string | null }
  | null {
  if (value.startsWith("dish:")) {
    const dishId = value.slice("dish:".length);
    return dishId ? { kind: "dish", dishId } : null;
  }
  if (value.startsWith("swap:")) {
    const [rest, toDishId = null] = value.slice("swap:".length).split("~");
    const [body, rowText] = rest!.split("@");
    const fromRow = rowText == null ? null : Number(rowText);
    if (fromRow != null && (!Number.isInteger(fromRow) || fromRow < 0)) return null;
    const colon = body!.lastIndexOf(":");
    if (colon < 0) return null;
    const pair = body!.slice(0, colon);
    const fromPicks = Number(body!.slice(colon + 1));
    const gt = pair.indexOf(">");
    if (gt < 0 || !Number.isInteger(fromPicks) || fromPicks < 1) return null;
    const fromCategory = pair.slice(0, gt);
    const toCategory = pair.slice(gt + 1);
    if (!fromCategory || !toCategory) return null;
    return { kind: "swap", fromCategory, toCategory, fromPicks, fromRow, toDishId: toDishId || null };
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
 * right now comes back `disabled` with a reason, so the row never changes shape.
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
  /** This cell's base composition row; with onePerRow, lets any row swap itself. */
  fromRow?: number | null;
  categoryLabel: (key: string) => string;
  /**
   * The dish a swap into this category brings, when it has just one (Daal → "Dal Tadka").
   * Undefined for categories the customer picks a dish in; the button then names the category.
   */
  destinationName?: (key: string) => string | undefined;
  /**
   * The dishes of a destination the customer picks in (Daal → Sabzi): the swap is then
   * offered as one button per dish, so swapping and picking is a single tap.
   */
  destinationDishes?: (key: string) => { id: string; name: string; disabled?: boolean; reason?: string }[] | undefined;
}): SlotDropdownOption[] {
  const { cellIndexInCategory, categoryKey, dishes, disabledDishIds, swapOptions, allowedSwaps, onePerRow, fromRow = null, categoryLabel, destinationName, destinationDishes } = args;
  const ownRow = onePerRow && fromRow != null;
  const out: SlotDropdownOption[] = [];

  for (const d of dishes) {
    const blocked = disabledDishIds?.has(d.id) ?? false;
    out.push({
      kind: "dish",
      value: dishOptionValue(d.id),
      label: d.name,
      dishId: d.id,
      ...(blocked ? { disabled: true, reason: "Not allowed with your other picks" } : {}),
    });
  }

  for (const opt of swapOptions) {
    if (opt.fromCategory !== categoryKey) continue;
    const toLabel = destinationName?.(opt.toCategory) ?? categoryLabel(opt.toCategory);
    const targets = destinationDishes?.(opt.toCategory);
    const rowOf = ownRow ? fromRow : null;
    // One button per destination dish when there is a choice to make, else one for the destination.
    const emit = (fromPicks: number, label: string, blocked: string | undefined, row: number | null) => {
      const each = targets?.length && label === toLabel ? targets : [{ id: null, name: label }];
      for (const t of each) {
        const why = blocked ?? ("reason" in t ? t.reason : undefined);
        out.push({
          kind: "swap",
          fromCategory: opt.fromCategory,
          toCategory: opt.toCategory,
          fromPicks,
          fromRow: row,
          toDishId: t.id,
          value: swapOptionValue(opt.fromCategory, opt.toCategory, fromPicks, row, t.id),
          label: t.name,
          ...(why || ("disabled" in t && t.disabled) ? { disabled: true, reason: why ?? "Not allowed with your other picks" } : {}),
        });
      }
    };
    const bundles = opt.validBundles.filter((b) => !onePerRow || b.fromPicks === 1);
    if (!opt.available || bundles.length === 0) {
      emit(1, toLabel, opt.reason ?? "Not available for this item", null);
      continue;
    }
    // Without a row of its own, a swap takes the leading row, so later rows wait their turn.
    if (!ownRow && cellIndexInCategory !== 0) {
      emit(1, toLabel, `Swap the ${categoryLabel(categoryKey)} above first`, null);
      continue;
    }
    for (const bundle of bundles) {
      const ok = !allowedSwaps || allowedSwaps.has(swapOptionValue(opt.fromCategory, opt.toCategory, bundle.fromPicks));
      // Like-for-like (8oz Sabzi → 8oz Daal): the row title already says the size, so just the name.
      const likeForLike = bundle.fromPicks === 1 && bundle.giveNatural === bundle.getNatural;
      emit(bundle.fromPicks, likeForLike ? toLabel : swapLabel(toLabel, bundle), ok ? undefined : "Not allowed with your other picks", rowOf);
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
