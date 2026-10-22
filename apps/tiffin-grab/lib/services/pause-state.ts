import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, eq, gt, inArray, isNotNull, isNull, lte, ne, not, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, subscriptionPauses } from "@/db/schema";

const log = createLogger("pause-state");

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Reader = Pick<typeof db, "select">;

/** An ordinary delivery a holiday added at plan end points back at this row: its tiffins are already re-homed. */
export const HAS_HOLIDAY_EXTRA = sql`exists (select 1 from deliveries hx where hx.holiday_extra_for_delivery_id = ${deliveries.id})`;

/**
 * A row whose tiffin already left: merged into another trip, replaced by a make-up, or stood in
 * for by the days a holiday added. It keeps its date (and its status) but carries nothing, so it
 * must never be put back on the schedule.
 */
export const MOVED_AWAY = sql`(${deliveries.mergedIntoDeliveryId} is not null or exists (select 1 from deliveries mv where mv.makeup_for_delivery_id = ${deliveries.id} or mv.holiday_extra_for_delivery_id = ${deliveries.id}))`;

/** Activity note that marks a holiday-closed day staff wrote off instead of placing. */
export const HOLIDAY_DISMISSED_NOTE = "Holiday day dismissed:";
// ponytail: the activity row is the marker, so no migration; a column if dismissals ever need reporting or undo.
export const HOLIDAY_DISMISSED = sql`exists (select 1 from order_activities da where da.delivery_id = ${deliveries.id} and da.type = 'note' and da.note like ${HOLIDAY_DISMISSED_NOTE + "%"})`;

/**
 * Paused by the customer (or staff on their behalf), as opposed to closed for a holiday. Every
 * pause rule (budget, cutoff lapse, Resume, the pause drawer, "all upcoming days paused") reads
 * this and never bare status = 'paused'. One rule in two forms: SQL for a where clause, the
 * function for a loaded row.
 */
export const CUSTOMER_PAUSED = sql`(${deliveries.status} = 'paused' and ${deliveries.holidayId} is null)`;
export const isCustomerPaused = (row: { status: string; holidayId: bigint | null }): boolean => row.status === "paused" && row.holidayId == null;

/**
 * The row flip a customer pause and a holiday share: scheduled -> paused, status-filtered so a
 * concurrent change drops the row. A customer pause needs the cutoff ahead. A holiday tags the
 * row and closes the day whatever the hour, unless the driver already delivered it. The caller
 * holds the order's advisory lock and owns every other rule (trial, make-up, budget).
 */
export async function pauseRows(tx: Tx, ids: bigint[], now: number, holidayId: bigint | null = null) {
  if (ids.length === 0) return [];
  return tx.update(deliveries).set({ status: "paused", ...(holidayId == null ? {} : { holidayId }) }).where(and(
    inArray(deliveries.id, ids),
    eq(deliveries.status, "scheduled"),
    holidayId == null ? gt(deliveries.cutoffAt, now) : sql`${deliveries.optimoCompletionStatus} is distinct from 'success'`,
  )).returning({ id: deliveries.id, publicId: deliveries.publicId, routeSyncedAt: deliveries.routeSyncedAt, deliveryDate: deliveries.deliveryDate });
}

/**
 * orders.status = 'paused' means nothing since pausing became day-level (the range pause that set it
 * is unreachable), yet fulfilment needs `active`. Any order found in it goes back to active,
 * unconditionally, with one activity. The caller holds the order's advisory lock; the update is
 * status-filtered, so running it again changes nothing and logs nothing.
 */
export async function retireLegacyPaused(tx: Tx, orderId: bigint): Promise<boolean> {
  const [flipped] = await tx.update(orders).set({ status: "active" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paused")))
    .returning({ organizationId: orders.organizationId });
  if (!flipped) return false;
  await tx.insert(orderActivities).values({
    orderId,
    type: "status_change",
    fromStatus: "paused",
    toStatus: "active",
    note: "The plan-level pause was retired; days are paused one by one now",
    organizationId: flipped.organizationId,
  });
  return true;
}

/**
 * A paused row whose cutoff passed did not go out. It becomes a hold (skipped) so Move is the way
 * out, with the same activity a hold gets (none for a row whose tiffin already left). Route fields
 * stay as they are: a stop still on OptimoRoute is what keeps the hold from being movable early,
 * and only pauseDays clears them, once the stop is really gone. The caller holds the order's
 * advisory lock; the update is status-filtered, so running it again changes nothing and logs nothing.
 */
export async function lapsePausedRows(tx: Tx, orderId: bigint): Promise<number> {
  await retireLegacyPaused(tx, orderId);
  const lapsed = await tx.update(deliveries).set({ status: "skipped" }).where(and(
    eq(deliveries.orderId, orderId),
    CUSTOMER_PAUSED,
    lte(deliveries.cutoffAt, Date.now()),
  )).returning({ id: deliveries.id, deliveryDate: deliveries.deliveryDate, movedAway: sql<boolean>`${MOVED_AWAY}` });
  const held = lapsed.filter((r) => !r.movedAway);
  if (held.length > 0) {
    await tx.insert(orderActivities).values(held.map((r) => ({
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
    holidayId: deliveries.holidayId,
    deliveryDate: deliveries.deliveryDate,
    cutoffAt: deliveries.cutoffAt,
    movedAway: sql<boolean>`${MOVED_AWAY}`,
  }).from(deliveries).where(and(eq(deliveries.orderId, orderId), inArray(deliveries.status, ["scheduled", "paused"])));
  const goingOut = rows.some((r) => r.status === "scheduled" && !r.movedAway && r.deliveryDate >= today);
  const stillPaused = rows.some((r) => isCustomerPaused(r) && r.cutoffAt > now && !r.movedAway);
  return stillPaused && !goingOut;
}

/**
 * Put paused days back on the same dates (null = every paused day still before cutoff), refunding
 * them in the pause log. The caller holds the order's advisory lock. A paused day whose tiffin was
 * moved away has nothing left to resume: putting it back would deliver twice. Returns the dates
 * put back, sorted; throws when there are none.
 */
export async function releasePausedRows(tx: Tx, orderId: bigint, wanted: string[] | null, actorId: bigint | null): Promise<string[]> {
  const conds = [
    eq(deliveries.orderId, orderId),
    CUSTOMER_PAUSED,
    gt(deliveries.cutoffAt, Date.now()),
    not(MOVED_AWAY),
  ];
  if (wanted) conds.push(inArray(deliveries.deliveryDate, wanted));
  const updated = await tx.update(deliveries).set({ status: "scheduled" }).where(and(...conds))
    .returning({ deliveryDate: deliveries.deliveryDate });
  if (updated.length === 0) throw new ValidationError("There are no paused days to resume for those dates");
  const back = new Set(updated.map((r) => r.deliveryDate));
  const logs = await tx.select({
    id: subscriptionPauses.id,
    deliveryDates: subscriptionPauses.deliveryDates,
    releasedDates: subscriptionPauses.releasedDates,
  }).from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
  for (const entry of logs) {
    const add = (entry.deliveryDates ?? []).filter((d) => back.has(d) && !(entry.releasedDates ?? []).includes(d));
    if (add.length === 0) continue;
    await tx.update(subscriptionPauses).set({ releasedDates: [...(entry.releasedDates ?? []), ...add] }).where(eq(subscriptionPauses.id, entry.id));
  }
  const dates = [...back].sort();
  await tx.insert(orderActivities).values({ orderId, type: "resumed", note: dates.join(", "), createdBy: actorId });
  return dates;
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
        // Dynamic import: push.ts imports daily-labels.service, which imports deliveries.service, which imports this module.
        const { pushOneDelivery } = await import("@/lib/services/optimoroute/push");
        await pushOneDelivery(row.publicId, row.deliveryDate, actorId);
      } catch (err) {
        log.error({ err, deliveryId: String(row.id) }, "optimoroute push after resume failed");
      }
    }
  } catch (err) {
    log.error({ err, orderId: String(orderId) }, "optimoroute push after resume failed");
  }
}
