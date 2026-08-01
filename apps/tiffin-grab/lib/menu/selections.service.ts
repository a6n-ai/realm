// Resolving "what a subscriber actually receives" lives in ONE place:
// resolveCategoriesForDay (resolve-delivery-meal.ts). buildMealsGrid consumes it, and any
// future kitchen/ops/Optimo read MUST too — a second implementation will drift, and then
// the subscriber sees one meal while the kitchen packs another.
import { ValidationError } from "@realm/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, dishPlans, dishes, mealSelections, menuItems, menuWeeks, orders } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { requireCategoryIds } from "@/lib/menu/category-ids";
import { visibleDeliveries } from "@/lib/services/deliveries.service";
import { type DayOfWeek } from "@/lib/menu/delivery-dates";

type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

const DAY_OFFSET: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const DAY_KEYS = Object.keys(DAY_OFFSET) as DayOfWeek[];

/**
 * The dish ids attached to a plan. Single source of truth for "what may this
 * plan be served", shared by setSelection (input validation), buildMealsGrid
 * (option filtering) and resolveDeliveryMeal (per-category filtering) so the
 * three can never disagree.
 *
 * Replaces the old dietsForPlanKey: membership is explicit rather than inferred
 * from a plan-key string, so a plan nobody special-cased (healthy) no longer
 * silently falls through to "everything".
 */
export async function dishIdsForPlan(planId: bigint): Promise<Set<bigint>> {
  const rows = await db.select({ dishId: dishPlans.dishId }).from(dishPlans).where(eq(dishPlans.planId, planId));
  return new Set(rows.map((r) => r.dishId));
}

// Deliberately NO veg/non-veg derivation here. Plans are user-editable, so any
// `plans.key === "veg"` test would be a magic string that breaks the moment
// someone renames a plan or adds another. A dish is simply "attached to these
// plans"; the code never decides what a dish *is*.

// The ISO date of `dayOfWeek` within the menu week starting on weekStart.
function dateInWeek(weekStartIso: string, dayOfWeek: DayOfWeek): string {
  const d = new Date(`${weekStartIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + DAY_OFFSET[dayOfWeek]);
  return d.toISOString().slice(0, 10);
}

export const selectionsService = {
  async setSelection(input: { order: Order; menuWeek: Week; dayOfWeek: DayOfWeek; slot: string; personIndex: number; pickIndex?: number; dishPublicId: string }) {
    const { order, menuWeek, dayOfWeek, slot, personIndex, pickIndex = 1, dishPublicId } = input;
    if (order.status === "cancelled") throw new ValidationError("This order is cancelled");
    if (personIndex < 1 || personIndex > order.persons) throw new ValidationError("Invalid person");

    const deliveryDateIso = dateInWeek(menuWeek.weekStart, dayOfWeek);

    // The `deliveries` row is the single source of truth for day-membership AND cutoff: a
    // paused/skipped/cancelled delivery — or a date with no row at all — has no scheduled row here.
    const [deliveryRow] = await db.select({ cutoffAt: deliveries.cutoffAt }).from(deliveries)
      .where(and(
        eq(deliveries.orderId, order.id),
        eq(deliveries.deliveryDate, deliveryDateIso),
        eq(deliveries.status, "scheduled"),
      ))
      .limit(1);
    if (!deliveryRow) {
      throw new ValidationError("That day isn't part of your order");
    }
    if (Date.now() > deliveryRow.cutoffAt) {
      throw new ValidationError("Selections are locked — the cutoff for that day has passed");
    }

    const categoryId = (await requireCategoryIds([slot])).get(slot)!;

    const [dishRow] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, dishPublicId)).limit(1);
    if (!dishRow) throw new ValidationError("Dish not found");
    const dishId = dishRow.id;

    const [item] = await db.select().from(menuItems).where(and(
      eq(menuItems.menuWeekId, menuWeek.id), eq(menuItems.dayOfWeek, dayOfWeek), eq(menuItems.categoryId, categoryId), eq(menuItems.dishId, dishId),
    )).limit(1);
    if (!item) throw new ValidationError("Dish is not available for that day and slot");

    // Membership check, not an attribute check: the dish must be attached to THIS
    // order's plan. A non-veg dish has no dish_plans row for the veg plan, so a
    // vegetarian subscriber cannot select one even by posting the id directly.
    const [attached] = await db
      .select({ id: dishPlans.id })
      .from(dishPlans)
      .where(and(eq(dishPlans.dishId, dishId), eq(dishPlans.planId, order.planId)))
      .limit(1);
    if (!attached) throw new ValidationError("Dish does not match your plan");

    // `slot` is a dish-category key: only categories marked selectable may receive a subscriber pick,
    // and pickIndex must fall within that category's per-plan count (e.g. sabzi:2 allows picks 1 and 2).
    const cats = await dishCategoriesService.forPlan(order.planId);
    const cat = cats.find((c) => c.key === slot);
    if (!cat) throw new ValidationError("Unknown category");
    if (!cat.selectable) throw new ValidationError("This item is fixed and can't be changed");
    const max = order.categoryCounts?.[slot] ?? 0;
    if (pickIndex < 1 || pickIndex > max) throw new ValidationError("Invalid pick");

    await db.insert(mealSelections).values({ orderId: order.id, menuWeekId: menuWeek.id, dayOfWeek, categoryId, personIndex, pickIndex, dishId })
      .onConflictDoUpdate({
        target: [mealSelections.orderId, mealSelections.menuWeekId, mealSelections.dayOfWeek, mealSelections.categoryId, mealSelections.personIndex, mealSelections.pickIndex],
        set: { dishId },
      });
  },

  async applyToWeek(input: { order: Order; menuWeek: Week; slot: string; personIndex: number; pickIndex?: number; dishPublicId: string }) {
    const { order, menuWeek, slot, personIndex, pickIndex, dishPublicId } = input;

    // The `deliveries` table is the single source of truth for which dates exist in this week —
    // the same source buildMealsGrid reads via visibleDeliveries. A make-up can land on a date
    // outside durationWeeks × deliveryDays, so recomputing dates from the plan's schedule (as
    // this used to do) silently drops make-up dates the grid still shows.
    const weekEnd = dateInWeek(menuWeek.weekStart, "sun");
    const rows = await visibleDeliveries(order.id, menuWeek.weekStart, weekEnd);
    const dateToDay = new Map<string, DayOfWeek>(DAY_KEYS.map((day) => [dateInWeek(menuWeek.weekStart, day), day]));

    let applied = 0;
    const skipped: { dateIso: string; reason: string }[] = [];
    for (const row of rows) {
      const dayOfWeek = dateToDay.get(row.deliveryDate);
      if (!dayOfWeek) continue; // defensive: visibleDeliveries is already bounded to this week
      try {
        await this.setSelection({ order, menuWeek, dayOfWeek, slot, personIndex, pickIndex, dishPublicId });
        applied += 1;
      } catch (e) {
        skipped.push({ dateIso: row.deliveryDate, reason: e instanceof Error ? e.message : "Could not apply" });
      }
    }
    return { applied, skipped };
  },
};
