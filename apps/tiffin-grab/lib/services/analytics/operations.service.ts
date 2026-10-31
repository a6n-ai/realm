import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { dateWhereCalendar, ordersScope, type AnalyticsScope } from "./metrics/scope";

const intCount = sql<number>`cast(count(*) as int)`;

export type OperationsStats = {
  totalDeliveries: number;
  skipped: number;
  cancelled: number;
  skipRatePct: number;
};

/** Deliveries by delivery date, for orders in the franchise / facet scope (the order's own organization_id). */
function deliveryWhere(scope: AnalyticsScope) {
  const orderScope = ordersScope(scope);
  return and(
    dateWhereCalendar(deliveries.deliveryDate, { fromMs: scope.fromMs, toMs: scope.toMs, tz: scope.tz }),
    orderScope ? sql`${deliveries.orderId} in (select ${orders.id} from ${orders} where ${orderScope})` : undefined,
  );
}

const noOrgs = (scope: AnalyticsScope) => scope.orgIds !== "all" && scope.orgIds.length === 0;

export async function getOperationsStats(scope: AnalyticsScope): Promise<OperationsStats> {
  if (noOrgs(scope)) return { totalDeliveries: 0, skipped: 0, cancelled: 0, skipRatePct: 0 };
  const where = deliveryWhere(scope);
  const [[{ n: totalDeliveries }], [{ n: skipped }], [{ n: cancelled }]] = await Promise.all([
    db.select({ n: intCount }).from(deliveries).where(where),
    db.select({ n: intCount }).from(deliveries).where(and(eq(deliveries.status, "skipped"), where)),
    db.select({ n: intCount }).from(deliveries).where(and(eq(deliveries.status, "cancelled"), where)),
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

export async function getDeliveryStatusMix(scope: AnalyticsScope) {
  if (noOrgs(scope)) return [];
  const where = deliveryWhere(scope);
  const rows = await db
    .select({ status: deliveries.status, n: intCount })
    .from(deliveries)
    .where(where)
    .groupBy(deliveries.status);
  return rows.map((r) => ({ status: STATUS_LABELS[r.status] ?? r.status, n: r.n }));
}

export async function getRouteLoadByDriver(limit = 10, scope: AnalyticsScope) {
  if (noOrgs(scope)) return [];
  const where = deliveryWhere(scope);
  const rows = await db
    .select({ driver: deliveries.routeDriverName, n: intCount })
    .from(deliveries)
    .where(and(isNotNull(deliveries.routeDriverName), where))
    .groupBy(deliveries.routeDriverName)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((r) => ({ driver: r.driver ?? "Unassigned", n: r.n }));
}
