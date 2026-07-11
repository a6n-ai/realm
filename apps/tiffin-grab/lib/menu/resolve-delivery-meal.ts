// Single source of truth for "what a subscriber receives" for a given order/week/day/person:
// buildMealsGrid must show exactly what this resolves, so any fulfillment/kitchen read
// reuses this instead of re-deriving the pick → isDefault fallback.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, plans } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { dietsForPlanKey } from "@/lib/menu/selections.service";
import type { DayOfWeek } from "@/lib/menu/delivery-dates";

// Narrowed to the fields actually used, so both a full `orders`/`menuWeeks` row (single-day
// callers) and the lighter shapes buildMealsGrid works with satisfy this structurally.
type Order = Pick<typeof orders.$inferSelect, "id" | "planId" | "categoryCounts">;
type Week = Pick<typeof menuWeeks.$inferSelect, "id">;

type Item = { slot: string; dishId: bigint; isDefault: boolean; diet: "veg" | "nonveg"; name: string; publicId: string };
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
// diet filtering. Shared by the single-day and week-batched entry points below so there is
// exactly one implementation of this logic — buildMealsGrid must call one of these two, never
// re-derive it.
function resolveCategoriesForDay(
  dayItems: Item[],
  dayPersonPicks: Pick_[],
  cats: Category[],
  counts: Record<string, number>,
  allowedDiets: ("veg" | "nonveg")[],
): ResolvedCategory[] {
  const out: ResolvedCategory[] = [];
  for (const c of cats) {
    const slotItems = dayItems.filter((i) => i.slot === c.key && allowedDiets.includes(i.diet));
    if (slotItems.length === 0) continue; // diet-filtered-empty: category isn't offered this day
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
      // diet) since the pick was made, fall back to the default dish entirely — never a
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

export async function resolveDeliveryMeal(order: Order, week: Week, dayOfWeek: DayOfWeek, person: number): Promise<ResolvedCategory[]> {
  const [plan] = await db.select({ key: plans.key, planType: plans.planType }).from(plans).where(eq(plans.id, order.planId)).limit(1);
  if (!plan) return [];
  const cats = await dishCategoriesService.forPlanType(plan.planType as "tiffin" | "healthy");
  const items = await db
    .select({ slot: menuItems.slot, dishId: menuItems.dishId, isDefault: menuItems.isDefault, diet: dishes.diet, name: dishes.name, publicId: dishes.publicId })
    .from(menuItems).innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .where(and(eq(menuItems.menuWeekId, week.id), eq(menuItems.dayOfWeek, dayOfWeek)))
    .orderBy(asc(menuItems.position));
  const picks = await db.select({ slot: mealSelections.slot, pickIndex: mealSelections.pickIndex, dishId: mealSelections.dishId })
    .from(mealSelections)
    .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.menuWeekId, week.id), eq(mealSelections.dayOfWeek, dayOfWeek), eq(mealSelections.personIndex, person)));

  return resolveCategoriesForDay(items, picks, cats, order.categoryCounts ?? {}, dietsForPlanKey(plan.key));
}

export type ResolvedMealsWeek = Map<string, ResolvedCategory[]>;

export function resolvedMealsWeekKey(day: DayOfWeek, personIndex: number): string {
  return `${day}:${personIndex}`;
}

// Batched variant of resolveDeliveryMeal for a whole week/order — one set of queries instead of
// one per (day, person). buildMealsGrid uses this rather than re-inlining the resolution.
export async function resolveDeliveryMealsForWeek(order: Order, week: Week, persons: number): Promise<ResolvedMealsWeek> {
  const result: ResolvedMealsWeek = new Map();
  const [plan] = await db.select({ key: plans.key, planType: plans.planType }).from(plans).where(eq(plans.id, order.planId)).limit(1);
  if (!plan) return result;
  const cats = await dishCategoriesService.forPlanType(plan.planType as "tiffin" | "healthy");
  const items = await db
    .select({ dayOfWeek: menuItems.dayOfWeek, slot: menuItems.slot, dishId: menuItems.dishId, isDefault: menuItems.isDefault, diet: dishes.diet, name: dishes.name, publicId: dishes.publicId })
    .from(menuItems).innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .where(eq(menuItems.menuWeekId, week.id))
    .orderBy(asc(menuItems.position));
  const picks = await db.select({ dayOfWeek: mealSelections.dayOfWeek, slot: mealSelections.slot, personIndex: mealSelections.personIndex, pickIndex: mealSelections.pickIndex, dishId: mealSelections.dishId })
    .from(mealSelections)
    .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.menuWeekId, week.id)));

  const allowedDiets = dietsForPlanKey(plan.key);
  const counts = order.categoryCounts ?? {};
  const days = [...new Set(items.map((i) => i.dayOfWeek))] as DayOfWeek[];
  for (const day of days) {
    const dayItems = items.filter((i) => i.dayOfWeek === day);
    for (let person = 1; person <= persons; person++) {
      const dayPersonPicks = picks.filter((p) => p.dayOfWeek === day && p.personIndex === person);
      result.set(resolvedMealsWeekKey(day, person), resolveCategoriesForDay(dayItems, dayPersonPicks, cats, counts, allowedDiets));
    }
  }
  return result;
}
