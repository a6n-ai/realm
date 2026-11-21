import { cache } from "react";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { can } from "@/lib/auth/guards";
import { fulfillmentReadyOrder } from "@/lib/orders/fulfillment";
import { getAppSettings } from "@/lib/settings";
import { requestNow } from "@/lib/dates/request-now";
import { getOptimoRouteStatus } from "./config";
import { routeLine, type RouteLine, type RouteLineCounts } from "./route-line";

// Same sendable rows as pushDay / nextRoutePushStatus, for today; the three steps' results are the
// columns each one writes (push: routeSyncedAt, pull routes: route driver, pull completions: optimoCompletionStatus).
async function todayCounts(today: string): Promise<RouteLineCounts> {
  const [row] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      sent: sql<number>`cast(count(${deliveries.routeSyncedAt}) as int)`,
      routed: sql<number>`cast(count(*) filter (where ${deliveries.routeDriverSerial} is not null or ${deliveries.routeDriverName} is not null) as int)`,
      done: sql<number>`cast(count(${deliveries.optimoCompletionStatus}) as int)`,
      lastSentAt: sql<number | null>`max(${deliveries.routeSyncedAt})`,
    })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(
      and(
        eq(deliveries.deliveryDate, today),
        eq(deliveries.status, "scheduled"),
        gt(deliveries.tiffinUnits, 0),
        isNull(deliveries.mergedIntoDeliveryId),
        fulfillmentReadyOrder(),
      ),
    );
  return { ...row, lastSentAt: row.lastSentAt === null ? null : Number(row.lastSentAt) };
}

/** Plain data for the sidebar clock card; null (render nothing) unless the viewer may see it. */
export const getRouteLine = cache(async (): Promise<RouteLine | null> => {
  const [canDispatch, canSettings] = await Promise.all([can({ delivery: ["read"] }), can({ settings: ["read"] })]);
  if (!canDispatch && !canSettings) return null;
  const [status, { timezone }] = await Promise.all([getOptimoRouteStatus(), getAppSettings()]);
  const counts =
    canDispatch && status.installed && status.hasApiKey
      ? await todayCounts(zonedDateIso(requestNow(), timezone))
      : null;
  return routeLine({ ...status, canDispatch, canSettings, tz: timezone, counts });
});
