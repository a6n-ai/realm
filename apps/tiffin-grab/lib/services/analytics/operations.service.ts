import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import {
  calendarDateWhere,
  ordersMatchFilters,
  type AnalyticsFilters,
} from "./shared-filters";

const intCount = sql<number>`cast(count(*) as int)`;

export type OperationsStats = {
  totalDeliveries: number;
  skipped: number;
  cancelled: number;
  skipRatePct: number;
};

async function deliveryScope(filters: AnalyticsFilters) {
  return and(
    await calendarDateWhere(deliveries.deliveryDate, filters),
    filters.plans.length || filters.mealSizes.length || filters.zones.length
      ? sql`${deliveries.orderId} in (select ${orders.id} from ${orders} where ${ordersMatchFilters(filters)})`
      : undefined,
  );
}

export async function getOperationsStats(
  filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] },
): Promise<OperationsStats> {
  const scope = await deliveryScope(filters);
  const [[{ n: totalDeliveries }], [{ n: skipped }], [{ n: cancelled }]] = await Promise.all([
    db.select({ n: intCount }).from(deliveries).where(scope),
    db.select({ n: intCount }).from(deliveries).where(and(eq(deliveries.status, "skipped"), scope)),
    db.select({ n: intCount }).from(deliveries).where(and(eq(deliveries.status, "cancelled"), scope)),
  ]);
  return {
    totalDeliveries,
    skipped,
    cancelled,
    skipRatePct: totalDeliveries > 0 ? Math.round((skipped / totalDeliveries) * 1000) / 10 : 0,
  };
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  paused: "Paused",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

export async function getDeliveryStatusMix(
  filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] },
) {
  const scope = await deliveryScope(filters);
  const rows = await db
    .select({ status: deliveries.status, n: intCount })
    .from(deliveries)
    .where(scope)
    .groupBy(deliveries.status);
  return rows.map((r) => ({ status: STATUS_LABELS[r.status] ?? r.status, n: r.n }));
}

export async function getRouteLoadByDriver(
  limit = 10,
  filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] },
) {
  const scope = await deliveryScope(filters);
  const rows = await db
    .select({ driver: deliveries.routeDriverName, n: intCount })
    .from(deliveries)
    .where(and(isNotNull(deliveries.routeDriverName), scope))
    .groupBy(deliveries.routeDriverName)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((r) => ({ driver: r.driver ?? "Unassigned", n: r.n }));
}
