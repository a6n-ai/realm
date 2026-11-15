import { round2 } from "@foundry/commons/util/money";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders } from "@/db/schema";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";
import { periodKey, periodLabel } from "./profitability";
import { getProfitabilityAssumptions } from "./profitability-settings";
import { EARNED_PER_TIFFIN, HAS_CAPTURED } from "./profitability.service";
import { deliveredWhere } from "./delivered-where";
import { foodCostByTrip } from "./food-cost.service";
import { noOrgs } from "./metrics/scope";

export type OrderCostRow = {
  orderPublicId: string;
  deploymentId: string;
  customer: string;
  mealSize: string;
  tiffins: number;
  /** List price of these tiffins before any discount (order subtotal share). */
  selling: number;
  /** Coupons, staff and catalog discounts on these tiffins (selling minus the net price, ex tax). */
  deductions: number;
  revenue: number;
  food: number;
  driver: number;
  profit: number;
  /** Some tiffins hold items without a cost rate, so food is understated. */
  unrated: boolean;
};

export type OrderWeek = {
  key: string;
  label: string;
  orders: OrderCostRow[];
  totals: { orders: number; tiffins: number; selling: number; deductions: number; revenue: number; food: number; driver: number; profit: number };
};

type Acc = Omit<OrderCostRow, "profit">;
type OrderInfo = Pick<OrderCostRow, "orderPublicId" | "deploymentId" | "customer" | "mealSize">;

export function groupOrderWeeks(
  trips: { orderId: bigint; deliveryDate: string; tiffins: number; selling: number; deductions: number; revenue: number; food: number; unrated: boolean; order: OrderInfo }[],
  driverPerTiffin: number,
): OrderWeek[] {
  const weeks = new Map<string, Map<bigint, Acc>>();
  for (const t of trips) {
    const key = periodKey(t.deliveryDate, "weekly");
    const byOrder = weeks.get(key) ?? new Map<bigint, Acc>();
    const acc = byOrder.get(t.orderId) ?? { ...t.order, tiffins: 0, selling: 0, deductions: 0, revenue: 0, food: 0, driver: 0, unrated: false };
    acc.tiffins += t.tiffins;
    acc.selling += t.selling;
    acc.deductions += t.deductions;
    acc.revenue += t.revenue;
    acc.food += t.food;
    acc.driver += t.tiffins * driverPerTiffin;
    acc.unrated ||= t.unrated;
    byOrder.set(t.orderId, acc);
    weeks.set(key, byOrder);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, byOrder]) => {
      const rows = [...byOrder.values()]
        .map((a) => ({ ...a, selling: round2(a.selling), deductions: round2(a.deductions), revenue: round2(a.revenue), food: round2(a.food), driver: round2(a.driver), profit: round2(a.revenue - a.food - a.driver) }))
        .sort((a, b) => a.profit - b.profit);
      const sum = (k: "tiffins" | "selling" | "deductions" | "revenue" | "food" | "driver" | "profit") => round2(rows.reduce((s, r) => s + r[k], 0));
      return {
        key,
        label: periodLabel(key, "weekly"),
        orders: rows,
        totals: { orders: rows.length, tiffins: sum("tiffins"), selling: sum("selling"), deductions: sum("deductions"), revenue: sum("revenue"), food: sum("food"), driver: sum("driver"), profit: sum("profit") },
      };
    });
}

/**
 * Per-order costing by delivery week: revenue earned (same per-tiffin share as Profitability), food
 * from cost rates, and driver at the per-tiffin assumption. Monthly overheads stay out of the rows.
 */
export async function getOrderWeeks(scope: AnalyticsScope, from: string, to: string): Promise<OrderWeek[]> {
  if (noOrgs(scope)) return [];
  const [assumptions, earned, food] = await Promise.all([
    getProfitabilityAssumptions(),
    db
      .select({
        deliveryId: deliveries.id,
        orderId: orders.id,
        deliveryDate: deliveries.deliveryDate,
        tiffins: deliveries.tiffinUnits,
        revenue: sql<number>`coalesce(case when ${HAS_CAPTURED} and ${deliveries.complimentaryNote} is null
          then ${deliveries.tiffinUnits}::numeric * ${EARNED_PER_TIFFIN} end, 0)::float`,
        orderPublicId: orders.publicId,
        deploymentId: orders.deploymentId,
        customer: orders.fullName,
        mealSize: mealSizes.name,
        // Orders without a snapshot subtotal (imported/legacy) show their net price as selling, no deductions.
        listPerTiffin: sql<number>`coalesce(coalesce((${orders.pricingSnapshot}->>'subtotal')::numeric,
          ${orders.total}::numeric - coalesce((${orders.pricingSnapshot}->>'taxTotal')::numeric, 0)) / nullif(${orders.tiffinCount}, 0), 0)::float`,
        netPerTiffin: sql<number>`coalesce((${orders.total}::numeric - coalesce((${orders.pricingSnapshot}->>'taxTotal')::numeric, 0))
          / nullif(${orders.tiffinCount}, 0), 0)::float`,
      })
      .from(deliveries)
      .innerJoin(orders, eq(deliveries.orderId, orders.id))
      .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
      .where(deliveredWhere(scope, from, to)),
    foodCostByTrip(scope, from, to),
  ]);
  const foodByTrip = new Map(food.map((f) => [f.deliveryId, f]));
  return groupOrderWeeks(
    earned.map((e) => {
      const f = foodByTrip.get(e.deliveryId);
      return {
        orderId: e.orderId,
        deliveryDate: String(e.deliveryDate).slice(0, 10),
        tiffins: e.tiffins,
        selling: Number(e.listPerTiffin) * e.tiffins,
        deductions: Math.max(0, Number(e.listPerTiffin) - Number(e.netPerTiffin)) * e.tiffins,
        revenue: Number(e.revenue),
        food: f?.foodCost ?? 0,
        unrated: (f?.tiffinsWithoutRate ?? 0) > 0,
        order: { orderPublicId: e.orderPublicId, deploymentId: e.deploymentId, customer: e.customer, mealSize: e.mealSize },
      };
    }),
    assumptions.driverCostPerTiffin,
  );
}
