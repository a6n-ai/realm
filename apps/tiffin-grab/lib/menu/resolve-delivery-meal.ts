// Single source of truth for "what a subscriber receives" for a given order/week/day/person:
// buildMealsGrid must show exactly what this resolves, so any fulfillment/kitchen read
// reuses this instead of re-deriving the pick → isDefault fallback.
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, dishCategories, dishes, mealSelections, menuItems, menuWeeks, orders } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { dishIdsForPlan } from "@/lib/menu/selections.service";
import type { DayOfWeek } from "@/lib/menu/delivery-dates";

// Narrowed to the fields actually used, so both a full `orders`/`menuWeeks` row (single-day
// callers) and the lighter shapes buildMealsGrid works with satisfy this structurally.
type Order = Pick<typeof orders.$inferSelect, "id" | "planId" | "categoryCounts">;
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

type SwapRow = { fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number };

// Folds every applied swap for a delivery onto a base counts map, in the order the
// rows are given. Never clamps below 0 here — that's a service-layer invariant
// enforced at apply-time (applyDeliverySwap), not re-validated on every read.
export function applySwapsToCounts(counts: Record<string, number>, swaps: SwapRow[]): Record<string, number> {
  if (swaps.length === 0) return counts;
  const next = { ...counts };
  for (const s of swaps) {
    next[s.fromCategory] = (next[s.fromCategory] ?? 0) - s.qtyFrom;
    next[s.toCategory] = (next[s.toCategory] ?? 0) + s.qtyTo;
  }
  return next;
}

type Item = { slot: string; dishId: bigint; isDefault: boolean; name: string; publicId: string };
type Pick_ = { slot: string; pickIndex: number; dishId: bigint };
type Category = { key: string; selectable: boolean; label: string };

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
): ResolvedCategory[] {
  const out: ResolvedCategory[] = [];
  for (const c of cats) {
    const slotItems = dayItems.filter((i) => i.slot === c.key && planDishIds.has(i.dishId));
    if (slotItems.length === 0) continue; // nothing on this plan for that slot today
    // A category absent from the plan's category_counts isn't part of this plan at all — 0, not 1.
    const count = counts[c.key] ?? 0;
    if (count === 0) continue;
    const def = slotItems.find((i) => i.isDefault) ?? slotItems[0];

    if (!c.selectable) {
      out.push({
        category: c.key, selectable: false, label: c.label, quantity: count,
        picks: [{ dishId: def.dishId, dishPublicId: def.publicId, name: def.name, isDefaulted: true }],
      });
      continue;
    }

    const picks: ResolvedCategory["picks"] = [];
    for (let pi = 1; pi <= count; pi++) {
      const chosen = dayPersonPicks.find((p) => p.slot === c.key && p.pickIndex === pi);
      // If the chosen dish was removed from this day's menu (or no longer matches the plan's
      // plan membership) since the pick was made, fall back to the default dish entirely — never a
      // half-stale mix of ids/name.
      const chosenItem = chosen ? slotItems.find((i) => i.dishId === chosen.dishId) : undefined;
      const resolvedItem = chosenItem ?? def;
      picks.push({
        dishId: resolvedItem.dishId, dishPublicId: resolvedItem.publicId, name: resolvedItem.name,
        isDefaulted: !chosenItem,
      });
    }
    out.push({ category: c.key, selectable: true, label: c.label, quantity: picks.length, picks });
  }
  return out;
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
): Promise<ResolvedCategory[]> {
  // forPlan, never forPlanType: buildMealsGrid decides which categories to render with
  // forPlan(order.planId), so resolving against the plan_type union made the two disagree —
  // a category on the non-veg plan but not the veg plan resolved for a veg order and was
  // then dropped by the grid. One scope, one source.
  const cats = await dishCategoriesService.forPlan(order.planId);
  const items = await db
    .select({ slot: dishCategories.key, dishId: menuItems.dishId, isDefault: menuItems.isDefault, name: dishes.name, publicId: dishes.publicId })
    .from(menuItems)
    .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
    .where(and(eq(menuItems.menuWeekId, week.id), eq(menuItems.dayOfWeek, dayOfWeek)))
    .orderBy(asc(menuItems.position));
  const picks = await db.select({ slot: dishCategories.key, pickIndex: mealSelections.pickIndex, dishId: mealSelections.dishId })
    .from(mealSelections)
    .innerJoin(dishCategories, eq(dishCategories.id, mealSelections.categoryId))
    .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.menuWeekId, week.id), eq(mealSelections.dayOfWeek, dayOfWeek), eq(mealSelections.personIndex, person)));

  const swaps = deliveryId == null ? [] : await db
    .select({ fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo })
    .from(deliveryCategorySwaps)
    .where(eq(deliveryCategorySwaps.deliveryId, deliveryId));

  return resolveCategoriesForDay(items, picks, cats, applySwapsToCounts(order.categoryCounts ?? {}, swaps), await dishIdsForPlan(order.planId));
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
    .select({ dayOfWeek: menuItems.dayOfWeek, slot: dishCategories.key, dishId: menuItems.dishId, isDefault: menuItems.isDefault, name: dishes.name, publicId: dishes.publicId })
    .from(menuItems)
    .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
    .where(eq(menuItems.menuWeekId, week.id))
    .orderBy(asc(menuItems.position));
  const picks = await db.select({ dayOfWeek: mealSelections.dayOfWeek, slot: dishCategories.key, personIndex: mealSelections.personIndex, pickIndex: mealSelections.pickIndex, dishId: mealSelections.dishId })
    .from(mealSelections)
    .innerJoin(dishCategories, eq(dishCategories.id, mealSelections.categoryId))
    .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.menuWeekId, week.id)));

  const planDishIds = await dishIdsForPlan(order.planId);
  const baseCounts = order.categoryCounts ?? {};

  // Batch-fetch this week's delivery rows (to map date -> delivery id) and every
  // swap applied to any of them, in two queries total rather than one lookup per
  // day — same "one set of queries instead of one per (day, person)" shape this
  // function already uses for items/picks.
  const weekEnd = dateInWeek(week.weekStart, "sun");
  const deliveryRows = await db
    .select({ id: deliveries.id, deliveryDate: deliveries.deliveryDate })
    .from(deliveries)
    .where(and(eq(deliveries.orderId, order.id), gte(deliveries.deliveryDate, week.weekStart), lte(deliveries.deliveryDate, weekEnd)));
  const deliveryIdByDate = new Map(deliveryRows.map((d) => [d.deliveryDate, d.id]));

  const swapRows = deliveryRows.length === 0 ? [] : await db
    .select({ deliveryId: deliveryCategorySwaps.deliveryId, fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo })
    .from(deliveryCategorySwaps)
    .where(inArray(deliveryCategorySwaps.deliveryId, deliveryRows.map((d) => d.id)));

  const days = [...new Set(items.map((i) => i.dayOfWeek))] as DayOfWeek[];
  for (const day of days) {
    const dayItems = items.filter((i) => i.dayOfWeek === day);
    const deliveryId = deliveryIdByDate.get(dateInWeek(week.weekStart, day));
    const daySwaps = deliveryId == null ? [] : swapRows.filter((s) => s.deliveryId === deliveryId);
    const counts = applySwapsToCounts(baseCounts, daySwaps);
    for (let person = 1; person <= persons; person++) {
      const dayPersonPicks = picks.filter((p) => p.dayOfWeek === day && p.personIndex === person);
      result.set(resolvedMealsWeekKey(day, person), resolveCategoriesForDay(dayItems, dayPersonPicks, cats, counts, planDishIds));
    }
  }
  return result;
}
