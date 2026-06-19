import { ValidationError } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, plans } from "@/db/schema";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

function dietsForPlanKey(planKey: string): ("veg" | "nonveg")[] {
  if (planKey === "veg") return ["veg"];
  if (planKey === "halal_nonveg") return ["nonveg"];
  return ["veg", "nonveg"]; // mixed
}

export const selectionsService = {
  async setSelection(input: { order: Order; menuWeek: Week; dayOfWeek: Day; slot: string; personIndex: number; dishId: string }) {
    const { order, menuWeek, dayOfWeek, slot, personIndex, dishId } = input;
    if (new Date() > new Date(menuWeek.orderCutoff)) throw new ValidationError("Selections are locked for this week");
    if (personIndex < 1 || personIndex > order.persons) throw new ValidationError("Invalid person");

    // Dish must be on the menu for this day/slot.
    const [item] = await db.select().from(menuItems).where(and(
      eq(menuItems.menuWeekId, menuWeek.id), eq(menuItems.dayOfWeek, dayOfWeek), eq(menuItems.slot, slot), eq(menuItems.dishId, dishId),
    )).limit(1);
    if (!item) throw new ValidationError("Dish is not available for that day and slot");

    // Diet must match the order's plan.
    const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.id, order.planId)).limit(1);
    const [dish] = await db.select({ diet: dishes.diet }).from(dishes).where(eq(dishes.id, dishId)).limit(1);
    if (!plan || !dish || !dietsForPlanKey(plan.key).includes(dish.diet)) throw new ValidationError("Dish does not match your plan");

    await db.insert(mealSelections).values({ orderId: order.id, menuWeekId: menuWeek.id, dayOfWeek, slot, personIndex, dishId })
      .onConflictDoUpdate({
        target: [mealSelections.orderId, mealSelections.menuWeekId, mealSelections.dayOfWeek, mealSelections.slot, mealSelections.personIndex],
        set: { dishId },
      });
  },

  async effectiveSelections(orderId: string, menuWeekId: string) {
    const picks = await db.select().from(mealSelections)
      .where(and(eq(mealSelections.orderId, orderId), eq(mealSelections.menuWeekId, menuWeekId)));
    return picks; // default-fill is applied in the grid loader (Task 8) using menu_items.isDefault
  },
};
