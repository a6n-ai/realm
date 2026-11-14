import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { fulfillmentReadyOrder } from "@/lib/orders/fulfillment";

export type RoutePushStatus = { date: string; total: number; pushed: number };

/**
 * The next delivery day after `today` and how many of its stops are on OptimoRoute. Today's run
 * went out yesterday, so the next day is the one staff still act on. Same rows pushDay sends:
 * scheduled, carrying tiffins, not merged into another day, on a paid (fulfillment-ready) order.
 */
export async function nextRoutePushStatus(today: string): Promise<RoutePushStatus | null> {
  const sendable = and(
    eq(deliveries.status, "scheduled"),
    gt(deliveries.tiffinUnits, 0),
    isNull(deliveries.mergedIntoDeliveryId),
    fulfillmentReadyOrder(),
  );
  const [next] = await db
    .select({ date: sql<string | null>`min(${deliveries.deliveryDate})` })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(sendable, gt(deliveries.deliveryDate, today)));
  if (!next?.date) return null;
  const [counts] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      pushed: sql<number>`cast(count(${deliveries.routeSyncedAt}) as int)`,
    })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(sendable, eq(deliveries.deliveryDate, next.date)));
  return { date: next.date, total: counts.total, pushed: counts.pushed };
}
