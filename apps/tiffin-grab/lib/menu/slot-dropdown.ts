/**
 * Per-composition-row options for the customer Edit meal sheet (radio list).
 * Dish picks stay same-category; swap entries come only from backend validBundles.
 *
 * Swaps front-splice fromCategory rows, so exchange options attach only to the
 * first remaining cell of that category (index 0). Larger bundles (fromPicks>1)
 * still appear there and remove multiple leading rows when applied.
 */

import type { SwapOption } from "./meal-validation";

export type SlotDishOption = {
  kind: "dish";
  value: string;
  label: string;
  dishId: string;
};

export type SlotSwapOption = {
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
 */
export function buildSlotDropdownOptions(args: {
  cellIndexInCategory: number;
  categoryKey: string;
  dishes: readonly { id: string; name: string }[];
  swapOptions: readonly SwapOption[];
  categoryLabel: (key: string) => string;
}): SlotDropdownOption[] {
  const { cellIndexInCategory, categoryKey, dishes, swapOptions, categoryLabel } = args;
  const out: SlotDropdownOption[] = [];

  for (const d of dishes) {
    out.push({
      kind: "dish",
      value: dishOptionValue(d.id),
      label: d.name,
      dishId: d.id,
    });
  }

  // Only the leading row can be exchanged — matches front-splice semantics.
  if (cellIndexInCategory !== 0) return out;

  for (const opt of swapOptions) {
    if (!opt.available || opt.fromCategory !== categoryKey) continue;
    const toLabel = categoryLabel(opt.toCategory);
    for (const bundle of opt.validBundles) {
      out.push({
        kind: "swap",
        value: swapOptionValue(opt.fromCategory, opt.toCategory, bundle.fromPicks),
        label: swapLabel(toLabel, bundle),
        fromCategory: opt.fromCategory,
        toCategory: opt.toCategory,
        fromPicks: bundle.fromPicks,
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
