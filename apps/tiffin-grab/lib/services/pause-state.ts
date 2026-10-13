import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, subscriptionPauses } from "@/db/schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Reader = Pick<typeof db, "select">;

/**
 * A row whose tiffin already left: merged into another trip or replaced by a make-up. It keeps
 * its date (and its status) but carries nothing, so it must never be put back on the schedule.
 */
export const MOVED_AWAY = sql`(${deliveries.mergedIntoDeliveryId} is not null or exists (select 1 from deliveries mv where mv.makeup_for_delivery_id = ${deliveries.id}))`;

/** A tiffin was moved onto this row (or relabelled on it); it cannot move again, so the row must not lapse. */
export const CARRIES_MOVED_IN = sql`exists (select 1 from delivery_moves dm where dm.to_delivery_id = ${deliveries.id})`;

/**
 * A paused row whose cutoff passed did not go out. It becomes a hold (skipped) so Move is the way
 * out, with the same activity a hold gets. The caller holds the order's advisory lock; the update
 * is status-filtered, so running it again changes nothing and logs nothing.
 */
export async function lapsePausedRows(tx: Tx, orderId: bigint): Promise<number> {
  const lapsed = await tx.update(deliveries).set({
    status: "skipped",
    routeSyncedAt: null,
    routeDriverSerial: null,
    routeDriverName: null,
    routeStopNumber: null,
  }).where(and(
    eq(deliveries.orderId, orderId),
    eq(deliveries.status, "paused"),
    lte(deliveries.cutoffAt, Date.now()),
  )).returning({ id: deliveries.id, deliveryDate: deliveries.deliveryDate });
  if (lapsed.length > 0) {
    await tx.insert(orderActivities).values(lapsed.map((r) => ({
      orderId,
      deliveryId: r.id,
      type: "skipped" as const,
      note: `Pause reached cutoff on ${r.deliveryDate}`,
    })));
  }
  return lapsed.length;
}

/**
 * Per order: dates that were paused through the day-set pause and never put back. A held row on
 * one of these dates is a lapsed pause (it has no route stop), which Move may release at once.
 * Old range pauses (null delivery_dates) are not day-set pauses and are ignored.
 */
export async function lapsedPauseDates(exec: Reader, orderIds: bigint[]): Promise<Map<bigint, Set<string>>> {
  const out = new Map<bigint, Set<string>>();
  if (orderIds.length === 0) return out;
  const logs = await exec.select({
    orderId: subscriptionPauses.orderId,
    deliveryDates: subscriptionPauses.deliveryDates,
    releasedDates: subscriptionPauses.releasedDates,
  }).from(subscriptionPauses).where(and(inArray(subscriptionPauses.orderId, orderIds), isNotNull(subscriptionPauses.deliveryDates)));
  for (const log of logs) {
    const released = new Set(log.releasedDates ?? []);
    const set = out.get(log.orderId) ?? new Set<string>();
    for (const d of log.deliveryDates ?? []) if (!released.has(d)) set.add(d);
    out.set(log.orderId, set);
  }
  return out;
}

/** Lapsed from a pause AND no route stop: a day staff re-opened and routed, then held, still waits for the truck. */
export function isLapsedPause(row: { status: string; deliveryDate: string; routeSyncedAt: number | null }, lapsed: ReadonlySet<string> | undefined): boolean {
  return row.status === "skipped" && row.routeSyncedAt == null && !!lapsed?.has(row.deliveryDate);
}

/**
 * Computed on read, never stored: the plan has paused days still ahead and nothing left that is
 * going out (no scheduled row dated today or later, make-ups included). orders.status stays active.
 */
export async function isOrderFullyPaused(exec: Reader, orderId: bigint, today: string, now = Date.now()): Promise<boolean> {
  const rows = await exec.select({
    status: deliveries.status,
    deliveryDate: deliveries.deliveryDate,
    cutoffAt: deliveries.cutoffAt,
    movedAway: sql<boolean>`${MOVED_AWAY}`,
  }).from(deliveries).where(and(eq(deliveries.orderId, orderId), inArray(deliveries.status, ["scheduled", "paused"])));
  const goingOut = rows.some((r) => r.status === "scheduled" && !r.movedAway && r.deliveryDate >= today);
  const stillPaused = rows.some((r) => r.status === "paused" && r.cutoffAt > now && !r.movedAway);
  return stillPaused && !goingOut;
}
