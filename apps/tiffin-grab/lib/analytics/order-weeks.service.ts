import { round2 } from "@foundry/commons/util/money";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders } from "@/db/schema";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";
import { periodKey, periodLabel, type Grain } from "./profitability";
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
  /** Of `tiffins`, the free ones staff added (complimentary): no selling price and no revenue. */
  free: number;
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

export type OrderPeriod = {
  key: string;
  label: string;
  orders: OrderCostRow[];
  totals: { orders: number; tiffins: number; free: number; selling: number; deductions: number; revenue: number; food: number; driver: number; profit: number };
};

/** @deprecated Prefer OrderPeriod; kept for the weekly table import sites. */
export type OrderWeek = OrderPeriod;

type Acc = Omit<OrderCostRow, "profit">;
type OrderInfo = Pick<OrderCostRow, "orderPublicId" | "deploymentId" | "customer" | "mealSize">;
export type OrderCostTrip = {
  orderId: bigint;
  deliveryDate: string;
  tiffins: number;
  free: number;
  selling: number;
  deductions: number;
  revenue: number;
  food: number;
  unrated: boolean;
  order: OrderInfo;
};

const SUM_KEYS = ["tiffins", "free", "selling", "deductions", "revenue", "food", "driver", "profit"] as const;

/** Groups delivered trips into one row per order per period. Monthly overheads stay out of the rows. */
export function groupOrderCosts(trips: OrderCostTrip[], driverPerTiffin: number, grain: Extract<Grain, "daily" | "weekly">): OrderPeriod[] {
  const periods = new Map<string, Map<bigint, Acc>>();
  for (const t of trips) {
    const key = periodKey(t.deliveryDate, grain);
    const byOrder = periods.get(key) ?? new Map<bigint, Acc>();
    const acc = byOrder.get(t.orderId) ?? { ...t.order, tiffins: 0, free: 0, selling: 0, deductions: 0, revenue: 0, food: 0, driver: 0, unrated: false };
    acc.tiffins += t.tiffins;
    acc.free += t.free;
    acc.selling += t.selling;
    acc.deductions += t.deductions;
    acc.revenue += t.revenue;
    acc.food += t.food;
    acc.driver += t.tiffins * driverPerTiffin;
    acc.unrated ||= t.unrated;
    byOrder.set(t.orderId, acc);
    periods.set(key, byOrder);
  }
  return [...periods.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, byOrder]) => {
      const rows = [...byOrder.values()]
        .map((a) => ({
          ...a,
          selling: round2(a.selling),
          deductions: round2(a.deductions),
          revenue: round2(a.revenue),
          food: round2(a.food),
          driver: round2(a.driver),
          profit: round2(a.revenue - a.food - a.driver),
        }))
        .sort((a, b) => a.profit - b.profit);
      const sum = (k: (typeof SUM_KEYS)[number]) => round2(rows.reduce((s, r) => s + r[k], 0));
      return {
        key,
        label: periodLabel(key, grain),
        orders: rows,
        totals: {
          orders: rows.length,
          tiffins: sum("tiffins"),
          free: sum("free"),
          selling: sum("selling"),
          deductions: sum("deductions"),
          revenue: sum("revenue"),
          food: sum("food"),
          driver: sum("driver"),
          profit: sum("profit"),
        },
      };
    });
}

export function groupOrderWeeks(trips: OrderCostTrip[], driverPerTiffin: number): OrderWeek[] {
  return groupOrderCosts(trips, driverPerTiffin, "weekly");
}

async function loadOrderCostTrips(scope: AnalyticsScope, from: string, to: string): Promise<{ trips: OrderCostTrip[]; driverPerTiffin: number }> {
  if (noOrgs(scope)) return { trips: [], driverPerTiffin: 0 };
  const [assumptions, earned, food] = await Promise.all([
    getProfitabilityAssumptions(),
    db
      .select({
        deliveryId: deliveries.id,
        orderId: orders.id,
        deliveryDate: deliveries.deliveryDate,
        tiffins: deliveries.tiffinUnits,
        free: sql<boolean>`${deliveries.complimentaryNote} is not null`,
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
  return {
    driverPerTiffin: assumptions.driverCostPerTiffin,
    trips: earned.map((e) => {
      const f = foodByTrip.get(e.deliveryId);
      return {
        orderId: e.orderId,
        deliveryDate: String(e.deliveryDate).slice(0, 10),
        tiffins: e.tiffins,
        free: e.free ? e.tiffins : 0,
        // A free tiffin was never sold, so it carries no list price or discount, only cost.
        selling: e.free ? 0 : Number(e.listPerTiffin) * e.tiffins,
        deductions: e.free ? 0 : Math.max(0, Number(e.listPerTiffin) - Number(e.netPerTiffin)) * e.tiffins,
        revenue: Number(e.revenue),
        food: f?.foodCost ?? 0,
        unrated: (f?.tiffinsWithoutRate ?? 0) > 0,
        order: { orderPublicId: e.orderPublicId, deploymentId: e.deploymentId, customer: e.customer, mealSize: e.mealSize },
      };
    }),
  };
}

export type OrderCostReport = {
  weeks: OrderWeek[];
  byDay: Record<string, OrderCostRow[]>;
};

/**
 * Per-order costing for a delivery window: revenue earned (same per-tiffin share as Profitability),
 * food from cost rates, and driver at the per-tiffin assumption. Monthly overheads stay out of the rows.
 */
export async function getOrderCostReport(scope: AnalyticsScope, from: string, to: string): Promise<OrderCostReport> {
  const { trips, driverPerTiffin } = await loadOrderCostTrips(scope, from, to);
  const byDay: Record<string, OrderCostRow[]> = {};
  for (const period of groupOrderCosts(trips, driverPerTiffin, "daily")) {
    byDay[period.key] = period.orders;
  }
  return { weeks: groupOrderCosts(trips, driverPerTiffin, "weekly"), byDay };
}

export async function getOrderWeeks(scope: AnalyticsScope, from: string, to: string): Promise<OrderWeek[]> {
  return (await getOrderCostReport(scope, from, to)).weeks;
}

/** Same costing as getOrderWeeks, keyed by delivery date for day-card drill-downs. */
export async function getOrderCostsByDay(scope: AnalyticsScope, from: string, to: string): Promise<Record<string, OrderCostRow[]>> {
  return (await getOrderCostReport(scope, from, to)).byDay;
}
