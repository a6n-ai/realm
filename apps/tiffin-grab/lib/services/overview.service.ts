import "server-only";
import { cache } from "react";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders } from "@/db/schema";
import { addDays } from "@/lib/deliveries-view/week";
import { buildKitchenWeek, type KitchenWeekRow } from "@/lib/overview/kitchen-week";
import { getDailyScorecard } from "./analytics/overview.service";
import { getDeliveriesDaily } from "./analytics/operations.service";
import { countOrders } from "./analytics/metrics/orders";
import { buildAnalyticsScope } from "./analytics/metrics/scope";
import { getOrdersOverview } from "./orders-stats.service";
import { getAppSettings } from "./app-settings.service";
import { dayStartMs } from "./today.service";

type Visible = "all" | string[];
const DAY = 864e5;

export type OverviewDay = { date: string; revenue: number; orders: number; tiffins: number };
export type OverviewSeries = {
  /** Oldest first, 14 days ending today. */
  days: OverviewDay[];
  mtdRevenue: number;
  activePlans: number;
  renewal: { rate: number | null; prevRate: number | null; renewed: number; ended: number };
};

const rate = (r: { ended: number; renewed: number }) => (r.ended > 0 ? Math.round((r.renewed / r.ended) * 1000) / 10 : null);

/**
 * Everything the tiles and the pace chart need. Revenue and orders come from the analytics daily
 * scorecard, scheduled stops from its deliveries query, active plans from `countOrders` (the
 * Analytics definition, with the date range opened up), renewal rate from the Orders page's
 * `getOrdersOverview`. `cache` shares one read between the tiles card and the pace card.
 */
export const getOverviewSeries = cache(async (visible: Visible, today: string, now: number): Promise<OverviewSeries> => {
  const { timezone: tz } = await getAppSettings();
  const from14 = addDays(today, -13);
  const monthStart = `${today.slice(0, 8)}01`;
  const from = monthStart < from14 ? monthStart : from14;
  const scope = { ...buildAnalyticsScope({}, visible, tz, now), fromMs: dayStartMs(from, tz), toMs: now };
  const [rows, deliveryDays, activePlans, ren, prevRen] = await Promise.all([
    getDailyScorecard(scope, { now }),
    getDeliveriesDaily(scope),
    countOrders({ ...scope, fromMs: 0 }, { status: ["active"] }),
    getOrdersOverview({ from: now - 30 * DAY, to: now }, visible),
    getOrdersOverview({ from: now - 60 * DAY, to: now - 30 * DAY - 1 }, visible),
  ]);
  const byDate = new Map((rows ?? []).map((r) => [r.date, r]));
  const sched = new Map(deliveryDays.map((d) => [d.iso, d.scheduled]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13);
    const r = byDate.get(date);
    return { date, revenue: r?.revenue ?? 0, orders: r?.orders ?? 0, tiffins: sched.get(date) ?? 0 };
  });
  const mtdRevenue = (rows ?? []).filter((r) => r.date >= monthStart).reduce((s, r) => s + r.revenue, 0);
  return {
    days,
    mtdRevenue,
    activePlans,
    renewal: { rate: rate(ren.renewals), prevRate: rate(prevRen.renewals), ...ren.renewals },
  };
});

export type DriverLane = { driver: string; stops: number; done: number };

/** Stops per OptimoRoute driver on a day, and how many have a success completion. Unscoped: callers gate on coversAllOrgs. */
export async function getDriverLanes(date: string): Promise<DriverLane[]> {
  const rows = await db
    .select({
      driver: deliveries.routeDriverName,
      stops: sql<number>`cast(count(*) as int)`,
      done: sql<number>`cast(count(*) filter (where ${deliveries.optimoCompletionStatus} = 'success') as int)`,
    })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.deliveryDate, date),
        eq(deliveries.status, "scheduled"),
        gt(deliveries.tiffinUnits, 0),
        isNull(deliveries.mergedIntoDeliveryId),
        isNotNull(deliveries.routeDriverName),
      ),
    )
    .groupBy(deliveries.routeDriverName)
    .orderBy(sql`count(*) desc`);
  return rows.map((r) => ({ driver: r.driver ?? "Unassigned", stops: r.stops, done: r.done }));
}

/** Meal-size names in a stable order, so a size keeps its donut colour across days. */
export async function listMealSizeNames(): Promise<string[]> {
  const rows = await db.selectDistinct({ name: mealSizes.name }).from(mealSizes).orderBy(asc(mealSizes.name));
  return rows.map((r) => r.name);
}

/** Scheduled tiffins (sum of tiffin_units) per meal size for the week starting `monday` and the week before. */
export async function getKitchenWeek(visible: Visible, monday: string): Promise<KitchenWeekRow[]> {
  if (visible !== "all" && visible.length === 0) return [];
  const rows = await db
    .select({
      mealSize: mealSizes.name,
      date: deliveries.deliveryDate,
      units: sql<number>`cast(coalesce(sum(${deliveries.tiffinUnits}), 0) as int)`,
    })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .where(
      and(
        eq(deliveries.status, "scheduled"),
        isNull(deliveries.mergedIntoDeliveryId),
        gte(deliveries.deliveryDate, addDays(monday, -7)),
        lte(deliveries.deliveryDate, addDays(monday, 6)),
        visible === "all" ? undefined : inArray(orders.organizationId, visible),
      ),
    )
    .groupBy(mealSizes.name, deliveries.deliveryDate);
  return buildKitchenWeek(rows.map((r) => ({ mealSize: r.mealSize, date: String(r.date), units: r.units })), monday, addDays);
}
