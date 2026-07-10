// Resolving "what a subscriber actually receives" lives in ONE place:
// resolveCategoriesForDay (resolve-delivery-meal.ts). buildMealsGrid consumes it, and any
// future kitchen/ops/Optimo read MUST too — a second implementation will drift, and then
// the subscriber sees one meal while the kitchen packs another.
import { ValidationError } from "@realm/commons";
import { cutoffMsFor } from "@realm/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, dishes, mealSelections, menuItems, menuWeeks, orders, plans } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { orderDeliveryDays } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates, type DayOfWeek } from "@/lib/menu/delivery-dates";

type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

const DAY_OFFSET: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

// Single source of truth for "which diets does this plan key admit" — shared by setSelection
// (input validation), buildMealsGrid (dish-option filtering), and resolveDeliveryMeal
// (per-category diet filtering) so the three can never disagree.
export function dietsForPlanKey(planKey: string): ("veg" | "nonveg")[] {
  if (planKey === "veg") return ["veg"];
  if (planKey === "halal_nonveg") return ["nonveg"];
  return ["veg", "nonveg"];
}

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

    // The day must be part of this subscription's delivery set.
    const [freq] = await db.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = orderDeliveryDays({ frequencyKey: freq?.key ?? "5_day", includeSaturday: order.includeSaturday, includeSunday: order.includeSunday }) as DayOfWeek[];
    const dates = subscriptionDeliveryDates({ startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays });
    if (!dates.some((d) => d.dateIso === deliveryDateIso)) {
      throw new ValidationError("That day isn't part of your order");
    }

    // Per-day rolling cutoff in the app timezone.
    const { timezone, cutoffHour } = await getAppSettings();
    if (Date.now() > cutoffMsFor(deliveryDateIso, cutoffHour, timezone)) {
      throw new ValidationError("Selections are locked — the cutoff for that day has passed");
    }

    const [dishRow] = await db.select({ id: dishes.id, diet: dishes.diet }).from(dishes).where(eq(dishes.publicId, dishPublicId)).limit(1);
    if (!dishRow) throw new ValidationError("Dish not found");
    const dishId = dishRow.id;

    const [item] = await db.select().from(menuItems).where(and(
      eq(menuItems.menuWeekId, menuWeek.id), eq(menuItems.dayOfWeek, dayOfWeek), eq(menuItems.slot, slot), eq(menuItems.dishId, dishId),
    )).limit(1);
    if (!item) throw new ValidationError("Dish is not available for that day and slot");

    const [plan] = await db.select({ key: plans.key, planType: plans.planType, counts: plans.categoryCounts }).from(plans).where(eq(plans.id, order.planId)).limit(1);
    if (!plan || !dietsForPlanKey(plan.key).includes(dishRow.diet)) throw new ValidationError("Dish does not match your plan");

    // `slot` is a dish-category key: only categories marked selectable may receive a subscriber pick,
    // and pickIndex must fall within that category's per-plan count (e.g. sabzi:2 allows picks 1 and 2).
    const cats = await dishCategoriesService.forPlanType(plan.planType);
    const cat = cats.find((c) => c.key === slot);
    if (!cat) throw new ValidationError("Unknown category");
    if (!cat.selectable) throw new ValidationError("This item is fixed and can't be changed");
    const max = plan.counts?.[slot] ?? 0;
    if (pickIndex < 1 || pickIndex > max) throw new ValidationError("Invalid pick");

    await db.insert(mealSelections).values({ orderId: order.id, menuWeekId: menuWeek.id, dayOfWeek, slot, personIndex, pickIndex, dishId })
      .onConflictDoUpdate({
        target: [mealSelections.orderId, mealSelections.menuWeekId, mealSelections.dayOfWeek, mealSelections.slot, mealSelections.personIndex, mealSelections.pickIndex],
        set: { dishId },
      });
  },

  async applyToWeek(input: { order: Order; menuWeek: Week; slot: string; personIndex: number; pickIndex?: number; dishPublicId: string }) {
    const { order, menuWeek, slot, personIndex, pickIndex, dishPublicId } = input;

    const [freq] = await db.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = orderDeliveryDays({ frequencyKey: freq?.key ?? "5_day", includeSaturday: order.includeSaturday, includeSunday: order.includeSunday }) as DayOfWeek[];
    const dates = subscriptionDeliveryDates({ startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays })
      .filter((d) => d.weekStartIso === menuWeek.weekStart);

    let applied = 0;
    const skipped: { dateIso: string; reason: string }[] = [];
    for (const d of dates) {
      try {
        await this.setSelection({ order, menuWeek, dayOfWeek: d.dayOfWeek, slot, personIndex, pickIndex, dishPublicId });
        applied += 1;
      } catch (e) {
        skipped.push({ dateIso: d.dateIso, reason: e instanceof Error ? e.message : "Could not apply" });
      }
    }
    return { applied, skipped };
  },
};
