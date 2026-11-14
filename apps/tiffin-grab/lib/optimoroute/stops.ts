import { createLogger } from "@foundry/commons/logger";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { deleteOrder } from "./client";
import { pushOneDelivery } from "./push";

const log = createLogger("optimoroute-stops");

/** A delivery's stop on OptimoRoute: `routeSyncedAt` null means OptimoRoute never had it. */
export type OptimoSyncedRow = { publicId: string; routeSyncedAt: number | null };

/**
 * After a row left the schedule (held, moved, cancelled, closed for a holiday): take its stop off
 * OptimoRoute and clear the route columns, since the route stamp is the evidence a stop still
 * exists. Never throws: the DB change already committed, and a stop OptimoRoute already dropped or
 * an API hiccup must not undo it. `failed` lists the stops still on the route (their stamp stays).
 */
export async function removeStopsBestEffort(rows: OptimoSyncedRow[]): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    if (row.routeSyncedAt == null) continue;
    try {
      await deleteOrder(row.publicId);
      removed.push(row.publicId);
    } catch (e) {
      failed.push(row.publicId);
      log.error({ err: e, publicId: row.publicId }, "optimoroute delete failed");
    }
  }
  if (removed.length > 0) {
    try {
      await db.update(deliveries).set({ routeSyncedAt: null, routeDriverSerial: null, routeDriverName: null, routeStopNumber: null })
        .where(inArray(deliveries.publicId, removed));
    } catch (e) {
      log.error({ err: e, removed }, "optimoroute stop clear failed");
    }
  }
  return { removed, failed };
}

/**
 * A merge changes the target trip's units and covered days, so a stop already on OptimoRoute
 * must be re-pushed. Best-effort like the delete: the DB change already committed. Only touches
 * a stop we previously synced (routeSyncedAt set), never creates one for an unpushed day.
 */
export async function refreshStopBestEffort(deliveryId: bigint): Promise<void> {
  try {
    const [t] = await db.select({ publicId: deliveries.publicId, deliveryDate: deliveries.deliveryDate, routeSyncedAt: deliveries.routeSyncedAt, status: deliveries.status })
      .from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
    if (!t || t.routeSyncedAt == null || t.status !== "scheduled") return;
    await pushOneDelivery(t.publicId, t.deliveryDate);
  } catch (e) {
    log.error({ err: e, deliveryId: String(deliveryId) }, "optimoroute refresh-after-merge failed");
  }
}

/**
 * After a release commits: pausing took the stop off OptimoRoute, so a resumed day on a date that
 * was already pushed (another delivery of that date, same organization, carries a route stamp)
 * gets its one stop back. A date not pushed yet needs nothing: the day push will include it.
 * Never throws; the release has already committed.
 */
export async function restoreStopsBestEffort(orderId: bigint, dates: string[], actorId: bigint | null): Promise<void> {
  try {
    const [order] = await db.select({ org: orders.organizationId }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;
    const back = await db.select({ id: deliveries.id, publicId: deliveries.publicId, deliveryDate: deliveries.deliveryDate })
      .from(deliveries).where(and(eq(deliveries.orderId, orderId), inArray(deliveries.deliveryDate, dates), eq(deliveries.status, "scheduled")));
    for (const row of back) {
      try {
        const [pushed] = await db.select({ id: deliveries.id }).from(deliveries)
          .innerJoin(orders, eq(orders.id, deliveries.orderId))
          .where(and(
            eq(deliveries.deliveryDate, row.deliveryDate),
            ne(deliveries.id, row.id),
            isNotNull(deliveries.routeSyncedAt),
            order.org == null ? isNull(orders.organizationId) : eq(orders.organizationId, order.org),
          )).limit(1);
        if (!pushed) continue;
        await pushOneDelivery(row.publicId, row.deliveryDate, actorId);
      } catch (err) {
        log.error({ err, deliveryId: String(row.id) }, "optimoroute push after resume failed");
      }
    }
  } catch (err) {
    log.error({ err, orderId: String(orderId) }, "optimoroute push after resume failed");
  }
}
