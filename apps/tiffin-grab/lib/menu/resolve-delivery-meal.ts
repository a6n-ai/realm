// Single source of truth for "what a subscriber receives" for a given order/week/day/person:
// buildMealsGrid must show exactly what this resolves, so any fulfillment/kitchen read
// reuses this instead of re-deriving the pick → isDefault fallback.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, plans } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import type { DayOfWeek } from "@/lib/menu/delivery-dates";

type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

export type ResolvedCategory = {
  category: string;
  selectable: boolean;
  label: string;
  picks: { dishId: bigint; dishPublicId: string; name: string }[];
  quantity: number;
};

export async function resolveDeliveryMeal(order: Order, week: Week, dayOfWeek: DayOfWeek, person: number): Promise<ResolvedCategory[]> {
  const [plan] = await db.select({ planType: plans.planType, counts: plans.categoryCounts }).from(plans).where(eq(plans.id, order.planId)).limit(1);
  if (!plan) return [];
  const cats = await dishCategoriesService.forPlanType(plan.planType as "tiffin" | "healthy");
  const items = await db
    .select({ slot: menuItems.slot, dishId: menuItems.dishId, isDefault: menuItems.isDefault, name: dishes.name, publicId: dishes.publicId })
    .from(menuItems).innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .where(and(eq(menuItems.menuWeekId, week.id), eq(menuItems.dayOfWeek, dayOfWeek)))
    .orderBy(asc(menuItems.position));
  const picks = await db.select().from(mealSelections)
    .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.menuWeekId, week.id), eq(mealSelections.dayOfWeek, dayOfWeek), eq(mealSelections.personIndex, person)));
  const dishMeta = new Map(items.map((i) => [i.dishId, { name: i.name, dishPublicId: i.publicId }]));

  return cats
    .filter((c) => items.some((i) => i.slot === c.key))
    .map((c) => {
      const count = plan.counts?.[c.key] ?? 1;
      const slotItems = items.filter((i) => i.slot === c.key);
      const def = slotItems.find((i) => i.isDefault) ?? slotItems[0];
      if (!c.selectable) {
        return {
          category: c.key, selectable: false, label: c.label, quantity: count,
          picks: def ? [{ dishId: def.dishId, dishPublicId: def.publicId, name: def.name }] : [],
        };
      }
      const out: ResolvedCategory["picks"] = [];
      for (let pi = 1; pi <= count; pi++) {
        const chosen = picks.find((p) => p.slot === c.key && p.pickIndex === pi);
        const chosenMeta = chosen ? dishMeta.get(chosen.dishId) : undefined;
        // If the chosen dish was removed from this day's menu since the pick was made,
        // fall back to the default dish entirely (id/publicId/name as one consistent triple).
        const dishId = chosenMeta ? chosen!.dishId : def?.dishId;
        if (dishId == null) continue;
        const meta = chosenMeta ?? (def ? { name: def.name, dishPublicId: def.publicId } : undefined);
        if (!meta) continue;
        out.push({ dishId, dishPublicId: meta.dishPublicId, name: meta.name });
      }
      return { category: c.key, selectable: true, label: c.label, quantity: out.length, picks: out };
    });
}
