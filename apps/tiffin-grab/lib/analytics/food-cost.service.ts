import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { categoryCostRates, deliveries, deliveryCategorySwaps, dishCategories, mealSizeItems, orderAddons, orders } from "@/db/schema";
import { coveredDates } from "@/lib/deliveries/schedule/coverage";
import { type TuCategory } from "@/lib/menu/format-tu";
import { ADDON_SORT_BASE } from "@/lib/menu/grid-types";
import { slotRowsAfterSwaps, type MealSizeItemRow, type PortionSwap } from "@/lib/menu/pick-size";
import { swapsForDay } from "@/lib/menu/trip-meals";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";
import { tiffinFoodCost, type CostPick, type CostRate } from "./food-cost";
import { deliveredWhere } from "./delivered-where";
import { noOrgs } from "./metrics/scope";

export type FoodCostDay = { foodCost: number; tiffinsWithoutRate: number; unratedCategories: string[] };

/** One tiffin's picks for one eating day: the meal's rows plus add-on rows, folded through that day's swaps like the kitchen sheet. */
export function deliveryPicks(input: {
  items: (MealSizeItemRow & { planId: bigint })[];
  swaps: PortionSwap[];
  addons: { category: string; planId: bigint; tuAmount: number; qty: number }[];
  orderPlanId: bigint;
  categoriesByKey: Map<string, TuCategory>;
}): CostPick[] {
  const { items, swaps, addons, orderPlanId, categoriesByKey } = input;
  const mealPlans = new Map<string, bigint[]>();
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = mealPlans.get(item.category) ?? [];
    list.push(item.planId);
    mealPlans.set(item.category, list);
  }

  const addonRows = addons.flatMap((a) => Array.from({ length: a.qty }, () => a));
  const rows = [...items, ...addonRows.map((a, i) => ({ category: a.category, planId: a.planId, tuAmount: a.tuAmount, sortOrder: ADDON_SORT_BASE + i }))].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const rowPlans = new Map<string, bigint[]>();
  for (const row of rows) {
    const list = rowPlans.get(row.category) ?? [];
    list.push(row.planId);
    rowPlans.set(row.category, list);
  }

  const picks: CostPick[] = [];
  for (const [category, slots] of slotRowsAfterSwaps(rows, swaps, categoriesByKey)) {
    for (const slot of slots) {
      // A received slot has no source row: it is priced on the meal's first item of its category, else the order's plan.
      const planId = slot.row == null ? (mealPlans.get(category)?.[0] ?? orderPlanId) : rowPlans.get(category)![slot.row]!;
      picks.push({ category, planId, tu: slot.value });
    }
  }
  return picks;
}

/**
 * Internal food cost per delivery date (Analytics → Profitability). A trip's eating days all
 * land on its delivery date, the same date the revenue query groups by.
 */
export async function foodCostByDate(scope: AnalyticsScope, from: string, to: string): Promise<Map<string, FoodCostDay>> {
  const out = new Map<string, FoodCostDay>();
  if (noOrgs(scope)) return out;

  const trips = await db
    .select({
      id: deliveries.id,
      deliveryDate: deliveries.deliveryDate,
      coversDates: deliveries.coversDates,
      tiffinUnits: deliveries.tiffinUnits,
      orderId: orders.id,
      mealSizeId: orders.mealSizeId,
      planId: orders.planId,
      organizationId: orders.organizationId,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(deliveredWhere(scope, from, to));
  if (trips.length === 0) return out;

  // Subqueries, not id lists: a 12-month range can exceed Postgres's 65535 bind-parameter limit.
  const deliveredIds = db.select({ id: deliveries.id }).from(deliveries).innerJoin(orders, eq(deliveries.orderId, orders.id)).where(deliveredWhere(scope, from, to));
  const deliveredOrderIds = db.select({ id: orders.id }).from(deliveries).innerJoin(orders, eq(deliveries.orderId, orders.id)).where(deliveredWhere(scope, from, to));
  const mealSizeIds = [...new Set(trips.map((t) => t.mealSizeId))];
  const [items, swapRows, addonRows, categoryRows, rateRows] = await Promise.all([
    db
      .select({ mealSizeId: mealSizeItems.mealSizeId, category: mealSizeItems.category, planId: mealSizeItems.planId, tuAmount: mealSizeItems.tuAmount, sortOrder: mealSizeItems.sortOrder })
      .from(mealSizeItems)
      .where(inArray(mealSizeItems.mealSizeId, mealSizeIds)),
    db
      .select({
        deliveryId: deliveryCategorySwaps.deliveryId,
        forDate: deliveryCategorySwaps.forDate,
        fromCategory: deliveryCategorySwaps.fromCategory,
        toCategory: deliveryCategorySwaps.toCategory,
        qtyFrom: deliveryCategorySwaps.qtyFrom,
        qtyTo: deliveryCategorySwaps.qtyTo,
        fromRow: deliveryCategorySwaps.fromRow,
        receiveTu: deliveryCategorySwaps.receiveTu,
      })
      .from(deliveryCategorySwaps)
      .where(inArray(deliveryCategorySwaps.deliveryId, deliveredIds))
      .orderBy(asc(deliveryCategorySwaps.id)),
    db
      .select({ orderId: orderAddons.orderId, category: orderAddons.category, planId: orderAddons.planId, tuAmount: orderAddons.tuAmount, qty: orderAddons.qty })
      .from(orderAddons)
      .where(inArray(orderAddons.orderId, deliveredOrderIds))
      .orderBy(asc(orderAddons.id)),
    db
      .select({ key: dishCategories.key, tuUnitType: dishCategories.tuUnitType, tuUnitSize: dishCategories.tuUnitSize, tuUnitLabel: dishCategories.tuUnitLabel, selectable: dishCategories.selectable })
      .from(dishCategories),
    db
      .select({ category: categoryCostRates.category, planId: categoryCostRates.planId, organizationId: categoryCostRates.organizationId, costBase: categoryCostRates.costBase, costPerTu: categoryCostRates.costPerTu })
      .from(categoryCostRates)
      .where(eq(categoryCostRates.active, true)),
  ]);

  const itemsByMeal = new Map<bigint, (MealSizeItemRow & { planId: bigint })[]>();
  for (const i of items) {
    const list = itemsByMeal.get(i.mealSizeId) ?? [];
    list.push({ category: i.category, planId: i.planId, tuAmount: i.tuAmount, sortOrder: i.sortOrder });
    itemsByMeal.set(i.mealSizeId, list);
  }
  const swapsByDelivery = new Map<bigint, typeof swapRows>();
  for (const s of swapRows) {
    const list = swapsByDelivery.get(s.deliveryId) ?? [];
    list.push(s);
    swapsByDelivery.set(s.deliveryId, list);
  }
  const addonsByOrder = new Map<bigint, { category: string; planId: bigint; tuAmount: number; qty: number }[]>();
  for (const a of addonRows) {
    const list = addonsByOrder.get(a.orderId) ?? [];
    list.push({ category: a.category, planId: a.planId, tuAmount: Number(a.tuAmount), qty: a.qty });
    addonsByOrder.set(a.orderId, list);
  }
  const categoriesByKey = new Map<string, TuCategory>(
    categoryRows.map((c) => [c.key, { tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel, selectable: c.selectable }]),
  );
  const rates: CostRate[] = rateRows.map((r) => ({
    category: r.category,
    planId: r.planId,
    organizationId: r.organizationId,
    costBase: Number(r.costBase),
    costPerTu: Number(r.costPerTu),
  }));

  for (const trip of trips) {
    const days = coveredDates({ deliveryDate: trip.deliveryDate, coversDates: trip.coversDates });
    const persons = trip.tiffinUnits / days.length;
    const day = out.get(trip.deliveryDate) ?? { foodCost: 0, tiffinsWithoutRate: 0, unratedCategories: [] };
    const unrated = new Set(day.unratedCategories);
    const mealItems = itemsByMeal.get(trip.mealSizeId) ?? [];
    for (const eatingDay of days) {
      const picks = deliveryPicks({
        items: mealItems,
        swaps: swapsForDay(swapsByDelivery.get(trip.id) ?? [], { id: trip.id, deliveryDate: trip.deliveryDate }, eatingDay),
        addons: addonsByOrder.get(trip.orderId) ?? [],
        orderPlanId: trip.planId,
        categoriesByKey,
      });
      const priced = tiffinFoodCost(picks, rates, trip.organizationId);
      day.foodCost += priced.cost * persons;
      // A meal size with no items has no composition to price, so it is unrated rather than free.
      if (mealItems.length === 0 || priced.unrated.length > 0) {
        day.tiffinsWithoutRate += persons;
        priced.unrated.forEach((c) => unrated.add(c));
      }
    }
    day.unratedCategories = [...unrated].sort();
    out.set(trip.deliveryDate, day);
  }
  return out;
}
