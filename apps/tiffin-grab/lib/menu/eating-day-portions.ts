import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizeItems, orders } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import type { CalendarDay } from "@/lib/services/customer-deliveries.service";
import type { TuCategory } from "./format-tu";
import { addonItemsForOrder } from "./order-addon-items";
import { portionsByCategory } from "./pick-size";

export type PortionsByDate = Record<string, Record<string, (string | null)[]>>;

/**
 * Portions per category for each eating day that has swaps, after them (2 roti → 1 rice makes
 * Rice "2 unit"). Info views show these totals instead of listing the swaps, which are only how
 * a choice is stored. Days without swaps are left out: the plan's base portions apply.
 */
export async function portionsAfterSwaps(orderPublicId: string, days: CalendarDay[]): Promise<PortionsByDate> {
  const swapped = days.flatMap((d) => d.eatingDays ?? []).filter((e) => e.appliedSwaps.length > 0);
  if (swapped.length === 0) return {};
  const [order] = await db.select({ id: orders.id, mealSizeId: orders.mealSizeId, planId: orders.planId })
    .from(orders).where(eq(orders.publicId, orderPublicId)).limit(1);
  if (!order) return {};
  const [sizeItems, addonItems, planCats] = await Promise.all([
    db.select({ category: mealSizeItems.category, tuAmount: mealSizeItems.tuAmount, sortOrder: mealSizeItems.sortOrder })
      .from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, order.mealSizeId)).orderBy(asc(mealSizeItems.sortOrder)),
    addonItemsForOrder(order.id),
    dishCategoriesService.forPlan(order.planId),
  ]);
  const items = [...sizeItems, ...addonItems];
  const tu = new Map<string, TuCategory>(planCats.map((c) => [c.key, {
    tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel, selectable: c.selectable,
  }]));
  return Object.fromEntries(swapped.map((e) => [e.date, Object.fromEntries(portionsByCategory(items, tu, e.appliedSwaps))]));
}
