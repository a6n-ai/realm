// Single source of truth for "what a subscriber receives" for a given order/week/day/person:
// buildMealsGrid must show exactly what this resolves, so any fulfillment/kitchen read
// reuses this instead of re-deriving the pick → isDefault fallback.
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, dishCategories, dishes, mealSelections, mealSizeItems, menuItems, menuWeeks, orders } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { allowedDishIdsForMealSize, exclusiveDishIdsForPlan } from "@/lib/menu/selections.service";
import { defaultMenuItem, keepDefaultsWithinRules, maxTuPickIndex } from "@/lib/menu/default-pick";
import { mealRulesService } from "@/lib/services/meal-rules.service";
import type { MealRule } from "@/lib/menu/meal-rule-types";
import type { DayOfWeek } from "@/lib/menu/delivery-dates";
import { applySwapsToCounts, type SwapRow } from "@/lib/menu/swap-rules";
import { swapAppliesTo } from "@/lib/menu/coverage";
import { carryingTrips } from "@/lib/menu/trip-lookup";
import { isContainerCategory } from "@/lib/menu/format-tu";

// Narrowed to the fields actually used, so both a full `orders`/`menuWeeks` row (single-day
// callers) and the lighter shapes buildMealsGrid works with satisfy this structurally.
type Order = Pick<typeof orders.$inferSelect, "id" | "planId" | "mealSizeId" | "categoryCounts">;
// weekStart is needed to map each day of the week to its calendar date, so
// resolveDeliveryMealsForWeek can look up that date's delivery row (and its swaps)
// in one batched query rather than per day.
type Week = Pick<typeof menuWeeks.$inferSelect, "id" | "weekStart">;

// Same day-index table selections.service.ts keeps locally for its own date math —
// duplicated rather than shared, same precedent that file already sets.
const DAY_OFFSET: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function dateInWeek(weekStartIso: string, dayOfWeek: DayOfWeek): string {
  const d = new Date(`${weekStartIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + DAY_OFFSET[dayOfWeek]);
  return d.toISOString().slice(0, 10);
}

// Re-exported: existing server callers import the fold from here.
export { applySwapsToCounts, type SwapRow };

// Can `next` still be applied on top of `applied`? Folds every swap already in
// play before checking the from-category balance, so several swaps can stack on
// one composition but never past what is actually there. Shared by the
// per-delivery apply path and checkout — two copies of this arithmetic is how
// the two surfaces end up disagreeing about what a customer may order.
export function validateSwapStack(
  baseCounts: Record<string, number>,
  applied: SwapRow[],
  next: SwapRow,
): { ok: true } | { ok: false; reason: string } {
  const effective = applySwapsToCounts(baseCounts, applied);
  const available = effective[next.fromCategory] ?? 0;
  if (available < next.qtyFrom) {
    return { ok: false, reason: `Not enough ${next.fromCategory} left to give up (have ${available}, need ${next.qtyFrom})` };
  }
  return { ok: true };
}

type Item = { slot: string; dishId: bigint; isDefault: boolean; name: string; publicId: string; planId: bigint };
type Pick_ = { slot: string; pickIndex: number; dishId: bigint };
type Category = { key: string; selectable: boolean; label: string; tuUnitType?: string };

export type ResolvedCategory = {
  category: string;
  selectable: boolean;
  label: string;
  picks: { dishId: bigint; dishPublicId: string; name: string; isDefaulted: boolean }[];
  quantity: number;
};

// Core, pure resolution for one (day, person): default selection, stale-pick re-validation, and
// plan-membership filtering. Shared by the single-day and week-batched entry points below so there is
// exactly one implementation of this logic — buildMealsGrid must call one of these two, never
// re-derive it.
function resolveCategoriesForDay(
  dayItems: Item[],
  dayPersonPicks: Pick_[],
  cats: Category[],
  counts: Record<string, number>,
  // Dish ids attached to the order's plan. A menu item whose dish is not in
  // here is simply not offered — this is the food-safety filter.
  planDishIds: Set<bigint>,
  exclusiveDishIds: Set<bigint>,
  maxTuByCategory: Map<string, number>,
  rules: MealRule[] = [],
): ResolvedCategory[] {
  const out: ResolvedCategory[] = [];
  for (const c of cats) {
    const slotItems = dayItems.filter((i) => i.slot === c.key && planDishIds.has(i.dishId));
    if (slotItems.length === 0) continue; // nothing on this plan for that slot today
    // A category absent from the plan's category_counts isn't part of this plan at all — 0, not 1.
    const count = counts[c.key] ?? 0;
    if (count === 0) continue;
    // Missing composition rows: treat pick 1 as the largest container.
    const maxTuPi = maxTuByCategory.get(c.key) ?? 1;

    if (!c.selectable) {
      if (isContainerCategory(c)) {
        const picks: ResolvedCategory["picks"] = [];
        for (let pi = 1; pi <= count; pi++) {
          const def = defaultMenuItem(slotItems, pi, { exclusiveDishIds, maxTuPickIndex: maxTuPi }) ?? slotItems[0]!;
          picks.push({
            dishId: def.dishId,
            dishPublicId: def.publicId,
            name: def.name,
            isDefaulted: true,
          });
        }
        out.push({
          category: c.key,
          selectable: false,
          label: c.label,
          quantity: count,
          picks,
        });
      } else {
        const def = defaultMenuItem(slotItems, 1, { exclusiveDishIds, maxTuPickIndex: maxTuPi }) ?? slotItems[0]!;
        out.push({
          category: c.key,
          selectable: false,
          label: c.label,
          quantity: count,
          picks: [{ dishId: def.dishId, dishPublicId: def.publicId, name: def.name, isDefaulted: true }],
        });
      }
      continue;
    }

    const picks: ResolvedCategory["picks"] = [];
    for (let pi = 1; pi <= count; pi++) {
      const chosen = dayPersonPicks.find((p) => p.slot === c.key && p.pickIndex === pi);
      // If the chosen dish was removed from this day's menu (or no longer matches the plan's
      // plan membership) since the pick was made, fall back to the default dish entirely — never a
      // half-stale mix of ids/name.
      const chosenItem = chosen ? slotItems.find((i) => i.dishId === chosen.dishId) : undefined;
      const def = defaultMenuItem(slotItems, pi, { exclusiveDishIds, maxTuPickIndex: maxTuPi }) ?? slotItems[0]!;
      const resolvedItem = chosenItem ?? def;
      picks.push({
        dishId: resolvedItem.dishId, dishPublicId: resolvedItem.publicId, name: resolvedItem.name,
        isDefaulted: !chosenItem,
      });
    }
    out.push({ category: c.key, selectable: true, label: c.label, quantity: picks.length, picks });
  }
  return keepDefaultsWithinRules(
    out,
    (category) => dayItems.filter((i) => i.slot === category && planDishIds.has(i.dishId)),
    rules,
  );
}

async function defaultPickContext(order: Order) {
  const [planDishIds, exclusiveDishIds, itemRows, rules] = await Promise.all([
    // The union of every plan this meal size's OWN composition rows target — not
    // just the order's own plan. A meal size can carry two sabzi rows (one veg,
    // one non-veg), and both must be servable to the subscriber.
    allowedDishIdsForMealSize(order.mealSizeId),
    exclusiveDishIdsForPlan(order.planId),
    db
      .select({
        category: mealSizeItems.category,
        tuAmount: mealSizeItems.tuAmount,
        sortOrder: mealSizeItems.sortOrder,
      })
      .from(mealSizeItems)
      .where(eq(mealSizeItems.mealSizeId, order.mealSizeId)),
    mealRulesService.listEnabledForOrder({ planId: order.planId, mealSizeId: order.mealSizeId }),
  ]);
  const byCat = new Map<string, typeof itemRows>();
  const liveCounts: Record<string, number> = {};
  for (const row of itemRows) {
    liveCounts[row.category] = (liveCounts[row.category] ?? 0) + 1;
    const list = byCat.get(row.category);
    if (list) list.push(row);
    else byCat.set(row.category, [row]);
  }
  const maxTuByCat = new Map<string, number>();
  for (const [category, list] of byCat) {
    const idx = maxTuPickIndex(list);
    if (idx != null) maxTuByCat.set(category, idx);
  }
  return {
    planDishIds,
    exclusiveDishIds,
    maxTuByCat,
    liveCounts: itemRows.length > 0 ? liveCounts : null,
    rules,
  };
}

export async function resolveDeliveryMeal(
  order: Order,
  week: Week,
  dayOfWeek: DayOfWeek,
  person: number,
  // The delivery row this resolution is for, so applied swaps can be looked up.
  // null is a defensive fallback (no delivery row = no swaps possible) — every
  // real caller has one.
  deliveryId: bigint | null,
  // The eating date being resolved. Omit for the trip's own date; pass `forDate` (or the explicit
  // `eatingDate` + `tripDate` pair) for a carried day so that day's swaps (for_date) are used.
  // Explicit `swaps` may be passed directly (e.g. from resolveTripDay) so they take effect
  // even when deliveryId is null.
  options: { forDate?: string; eatingDate?: string; tripDate?: string; swaps?: SwapRow[] } = {},
): Promise<ResolvedCategory[]> {
  // forPlan, never forPlanType: buildMealsGrid decides which categories to render with
  // forPlan(order.planId), so resolving against the plan_type union made the two disagree —
  // a category on the non-veg plan but not the veg plan resolved for a veg order and was
  // then dropped by the grid. One scope, one source.
  const cats = await dishCategoriesService.forPlan(order.planId);
  const items = await db
    .select({ slot: dishCategories.key, dishId: menuItems.dishId, isDefault: menuItems.isDefault, name: dishes.name, publicId: dishes.publicId, planId: dishes.planId })
    .from(menuItems)
    .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
    .where(and(eq(menuItems.menuWeekId, week.id), eq(menuItems.dayOfWeek, dayOfWeek)))
    .orderBy(asc(menuItems.position));
  const picks = await db.select({ slot: dishCategories.key, pickIndex: mealSelections.pickIndex, dishId: mealSelections.dishId })
    .from(mealSelections)
    .innerJoin(dishCategories, eq(dishCategories.id, mealSelections.categoryId))
    .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.menuWeekId, week.id), eq(mealSelections.dayOfWeek, dayOfWeek), eq(mealSelections.personIndex, person)));

  let swaps: SwapRow[] = options.swaps ?? [];
  if (options.swaps == null && deliveryId != null) {
    const [trip] = await db.select({ deliveryDate: deliveries.deliveryDate }).from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
    const tripDate = options.tripDate ?? trip?.deliveryDate;
    const eatingDate = options.eatingDate ?? options.forDate ?? tripDate;
    const rows = await db
      .select({ fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo, forDate: deliveryCategorySwaps.forDate })
      .from(deliveryCategorySwaps)
      .where(eq(deliveryCategorySwaps.deliveryId, deliveryId))
      .orderBy(asc(deliveryCategorySwaps.id));
    swaps = tripDate && eatingDate ? rows.filter((r) => swapAppliesTo(r.forDate, tripDate, eatingDate)) : rows;
  }

  const { planDishIds, exclusiveDishIds, maxTuByCat, liveCounts, rules } = await defaultPickContext(order);
  const baseCounts = liveCounts ?? order.categoryCounts ?? {};
  return resolveCategoriesForDay(
    items,
    picks,
    cats,
    applySwapsToCounts(baseCounts, swaps),
    planDishIds,
    exclusiveDishIds,
    maxTuByCat,
    rules,
  );
}

export type ResolvedMealsWeek = Map<string, ResolvedCategory[]>;

export function resolvedMealsWeekKey(day: DayOfWeek, personIndex: number): string {
  return `${day}:${personIndex}`;
}

// Batched variant of resolveDeliveryMeal for a whole week/order — one set of queries instead of
// one per (day, person). buildMealsGrid uses this rather than re-inlining the resolution.
export async function resolveDeliveryMealsForWeek(order: Order, week: Week, persons: number): Promise<ResolvedMealsWeek> {
  const result: ResolvedMealsWeek = new Map();
  const cats = await dishCategoriesService.forPlan(order.planId);
  const items = await db
    .select({ dayOfWeek: menuItems.dayOfWeek, slot: dishCategories.key, dishId: menuItems.dishId, isDefault: menuItems.isDefault, name: dishes.name, publicId: dishes.publicId, planId: dishes.planId })
    .from(menuItems)
    .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
    .where(eq(menuItems.menuWeekId, week.id))
    .orderBy(asc(menuItems.position));
  const picks = await db.select({ dayOfWeek: mealSelections.dayOfWeek, slot: dishCategories.key, personIndex: mealSelections.personIndex, pickIndex: mealSelections.pickIndex, dishId: mealSelections.dishId })
    .from(mealSelections)
    .innerJoin(dishCategories, eq(dishCategories.id, mealSelections.categoryId))
    .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.menuWeekId, week.id)));

  const { planDishIds, exclusiveDishIds, maxTuByCat, liveCounts, rules } = await defaultPickContext(order);
  const baseCounts = liveCounts ?? order.categoryCounts ?? {};

  // Batch-fetch this week's delivery rows (to map date -> delivery id) and every
  // swap applied to any of them, in two queries total rather than one lookup per
  // day — same "one set of queries instead of one per (day, person)" shape this
  // function already uses for items/picks.
  const weekEnd = dateInWeek(week.weekStart, "sun");
  const carrying = await carryingTrips(order.id, week.weekStart, weekEnd);
  // Fallback for a date no scheduled trip covers (paused/skipped row): its own row, as before.
  const ownRows = await db
    .select({ id: deliveries.id, deliveryDate: deliveries.deliveryDate })
    .from(deliveries)
    .where(and(eq(deliveries.orderId, order.id), gte(deliveries.deliveryDate, week.weekStart), lte(deliveries.deliveryDate, weekEnd)));
  const tripIds = [...new Set([...carrying.values()].map((t) => t.id).concat(ownRows.map((r) => r.id)))];

  const swapRows = tripIds.length === 0 ? [] : await db
    .select({ deliveryId: deliveryCategorySwaps.deliveryId, fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo, forDate: deliveryCategorySwaps.forDate })
    .from(deliveryCategorySwaps)
    .where(inArray(deliveryCategorySwaps.deliveryId, tripIds))
    .orderBy(asc(deliveryCategorySwaps.id));
  const ownByDate = new Map(ownRows.map((d) => [d.deliveryDate, d]));

  const days = [...new Set(items.map((i) => i.dayOfWeek))] as DayOfWeek[];
  for (const day of days) {
    const dayItems = items.filter((i) => i.dayOfWeek === day);
    const date = dateInWeek(week.weekStart, day);
    const trip = carrying.get(date) ?? ownByDate.get(date);
    const daySwaps = trip == null ? [] : swapRows.filter((s) => s.deliveryId === trip.id && swapAppliesTo(s.forDate, trip.deliveryDate, date));
    const counts = applySwapsToCounts(baseCounts, daySwaps);
    for (let person = 1; person <= persons; person++) {
      const dayPersonPicks = picks.filter((p) => p.dayOfWeek === day && p.personIndex === person);
      result.set(
        resolvedMealsWeekKey(day, person),
        resolveCategoriesForDay(dayItems, dayPersonPicks, cats, counts, planDishIds, exclusiveDishIds, maxTuByCat, rules),
      );
    }
  }
  return result;
}
