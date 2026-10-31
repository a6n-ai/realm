import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { isoDateInZone } from "@/lib/analytics/profitability";
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
  return rows.map((r) => ({ status: STATUS_LABELS[r.status] ?? r.status, key: r.status, n: r.n }));
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

const DELIVERY_DAY_STATUSES = ["scheduled", "paused", "skipped", "cancelled"] as const;

/** Per-day rows split by status, sparse (days with no deliveries are absent); same where-clause as the status counts. */
export async function getDeliveriesDaily(scope: AnalyticsScope) {
  const rows = noOrgs(scope)
    ? []
    : await db
        .select({ iso: sql<string>`${deliveries.deliveryDate}::text`, status: deliveries.status, n: intCount })
        .from(deliveries)
        .where(deliveryWhere(scope))
        .groupBy(sql`1`, deliveries.status);
  const byDay = new Map<string, Record<(typeof DELIVERY_DAY_STATUSES)[number], number>>();
  for (const r of rows) {
    const d = byDay.get(r.iso) ?? { scheduled: 0, paused: 0, skipped: 0, cancelled: 0 };
    if (r.status in d) d[r.status as keyof typeof d] += r.n;
    byDay.set(r.iso, d);
  }
  return [...byDay].map(([iso, d]) => ({ iso, ...d }));
}
