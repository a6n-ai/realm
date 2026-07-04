// NOTE (2026-07-01): the isDefault fallback for "what a subscriber receives when they
// don't pick" lives only in buildMealsGrid (meals-grid.ts). No separate fulfillment read
// exists yet. Any future kitchen/ops read MUST resolve the same way (explicit pick →
// else the day/slot isDefault item) or subscribers get a different meal than the grid shows.
import { ValidationError } from "@realm/commons";
import { cutoffMsFor } from "@realm/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, dishes, mealSelections, menuItems, menuWeeks, orders, plans } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { orderDeliveryDays } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates, type DayOfWeek } from "@/lib/menu/delivery-dates";

type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

const DAY_OFFSET: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function dietsForPlanKey(planKey: string): ("veg" | "nonveg")[] {
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
  async setSelection(input: { order: Order; menuWeek: Week; dayOfWeek: DayOfWeek; slot: string; personIndex: number; dishPublicId: string }) {
    const { order, menuWeek, dayOfWeek, slot, personIndex, dishPublicId } = input;
    if (order.status === "cancelled") throw new ValidationError("This order is cancelled");
    if (personIndex < 1 || personIndex > order.persons) throw new ValidationError("Invalid person");

    const deliveryDateIso = dateInWeek(menuWeek.weekStart, dayOfWeek);

    // The day must be part of this subscription's delivery set.
    const [freq] = await db.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = orderDeliveryDays({ frequencyKey: freq?.key ?? "5_day", includeSaturday: order.includeSaturday, includeSunday: order.includeSunday }) as DayOfWeek[];
    const pauseWindow = order.pausedFrom && order.pausedUntil ? { from: order.pausedFrom, until: order.pausedUntil } : undefined;
    const dates = subscriptionDeliveryDates({ startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays, pauseWindow });
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

    const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.id, order.planId)).limit(1);
    if (!plan || !dietsForPlanKey(plan.key).includes(dishRow.diet)) throw new ValidationError("Dish does not match your plan");

    await db.insert(mealSelections).values({ orderId: order.id, menuWeekId: menuWeek.id, dayOfWeek, slot, personIndex, dishId })
      .onConflictDoUpdate({
        target: [mealSelections.orderId, mealSelections.menuWeekId, mealSelections.dayOfWeek, mealSelections.slot, mealSelections.personIndex],
        set: { dishId },
      });
  },

  async applyToWeek(input: { order: Order; menuWeek: Week; slot: string; personIndex: number; dishPublicId: string }) {
    const { order, menuWeek, slot, personIndex, dishPublicId } = input;

    const [freq] = await db.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = orderDeliveryDays({ frequencyKey: freq?.key ?? "5_day", includeSaturday: order.includeSaturday, includeSunday: order.includeSunday }) as DayOfWeek[];
    const pauseWindow = order.pausedFrom && order.pausedUntil ? { from: order.pausedFrom, until: order.pausedUntil } : undefined;
    const dates = subscriptionDeliveryDates({ startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays, pauseWindow })
      .filter((d) => d.weekStartIso === menuWeek.weekStart);

    let applied = 0;
    const skipped: { dateIso: string; reason: string }[] = [];
    for (const d of dates) {
      try {
        await this.setSelection({ order, menuWeek, dayOfWeek: d.dayOfWeek, slot, personIndex, dishPublicId });
        applied += 1;
      } catch (e) {
        skipped.push({ dateIso: d.dateIso, reason: e instanceof Error ? e.message : "Could not apply" });
      }
    }
    return { applied, skipped };
  },

  async effectiveSelections(orderId: bigint, menuWeekId: bigint) {
    const picks = await db.select().from(mealSelections)
      .where(and(eq(mealSelections.orderId, orderId), eq(mealSelections.menuWeekId, menuWeekId)));
    return picks;
  },
};
