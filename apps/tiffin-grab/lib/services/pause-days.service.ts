import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, not, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryMoves, orderActivities, orders, subscriptionPauses } from "@/db/schema";
import { deleteFromOptimoRouteBestEffort, type OptimoSyncedRow } from "./deliveries.service";
import { assertDaysPauseAllowed } from "./pause-limits.service";
import { CARRIES_MOVED_IN, CUSTOMER_PAUSED, MOVED_AWAY, lapsePausedRows, pauseRows, releasePausedRows, restoreStopsBestEffort, retireLegacyPaused } from "./pause-state";
import { publishAnalyticsLive } from "@/lib/realtime/publish-inbox";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function uniqueDates(dates: string[]): string[] {
  if (dates.length === 0) throw new ValidationError("Choose at least one delivery day");
  if (dates.some((d) => !ISO.test(d))) throw new ValidationError("Pause dates must be ISO YYYY-MM-DD");
  return [...new Set(dates)].sort();
}

async function orderByPublicId(publicId: string) {
  const [order] = await db.select({
    id: orders.id,
    status: orders.status,
    trialLength: orders.trialLength,
    publicId: orders.publicId,
  }).from(orders).where(eq(orders.publicId, publicId)).limit(1);
  if (!order) throw new ValidationError("Order not found");
  return order;
}

/**
 * After a pause commits: take the rows' stops off OptimoRoute. The route stamp is the evidence a
 * stop still exists, so it goes only once the stop is really gone. Returns how many were removed.
 */
export async function removeStopsBestEffort(rows: OptimoSyncedRow[]): Promise<number> {
  const gone = await deleteFromOptimoRouteBestEffort(rows);
  if (gone.length > 0) {
    await db.update(deliveries).set({ routeSyncedAt: null, routeDriverSerial: null, routeDriverName: null, routeStopNumber: null })
      .where(inArray(deliveries.publicId, gone));
  }
  return gone.length;
}

/**
 * Pause specific upcoming delivery days. The audit row is closed immediately so another
 * pause is legal while these days are still paused. The one-open unique index stays.
 */
export async function pauseDays(orderPublicId: string, dates: string[], actorId: bigint | null): Promise<{ paused: string[]; skipped: string[] }> {
  const wanted = uniqueDates(dates);
  const order = await orderByPublicId(orderPublicId);
  if (order.trialLength != null) throw new ValidationError("A trial can only have its dishes edited.");
  if (order.status !== "active" && order.status !== "paused") {
    throw new ValidationError(`Cannot pause an order that is ${order.status}`);
  }

  let removed: OptimoSyncedRow[] = [];
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
    await lapsePausedRows(tx, order.id);
    const rows = await tx.select().from(deliveries).where(and(
      eq(deliveries.orderId, order.id),
      inArray(deliveries.deliveryDate, wanted),
      isNull(deliveries.makeupForDeliveryId),
    ));
    const byDate = new Map(rows.map((r) => [r.deliveryDate, r]));
    const missing = wanted.filter((d) => !byDate.has(d));
    if (missing.length) throw new ValidationError("That date is not a delivery on this plan");
    const now = Date.now();
    const eligible = wanted.flatMap((d) => {
      const row = byDate.get(d)!;
      if (row.status !== "scheduled" || row.cutoffAt <= now) return [];
      return [row];
    });
    if (eligible.length === 0) throw new ValidationError("Cutoff has passed for those days");
    // A tiffin moved onto a day cannot move again. If this day lapsed into a hold, that paid tiffin would be stuck.
    const movedIn = await tx.select({ id: deliveryMoves.toDeliveryId }).from(deliveryMoves)
      .where(inArray(deliveryMoves.toDeliveryId, eligible.map((r) => r.id)));
    if (movedIn.length > 0) {
      const dates = eligible.filter((r) => movedIn.some((m) => m.id === r.id)).map((r) => r.deliveryDate);
      throw new ValidationError(`${dates.join(", ")} carries a tiffin moved from another day, so it can't be paused.`);
    }
    await assertDaysPauseAllowed(order.id, eligible.map((r) => r.deliveryDate), tx);

    const updated = await pauseRows(tx, eligible.map((r) => r.id), now);

    if (updated.length === 0) throw new ValidationError("Cutoff has passed for those days");
    const pausedDates = updated.map((r) => r.deliveryDate).sort();
    await tx.insert(subscriptionPauses).values({
      orderId: order.id,
      fromDate: pausedDates[0]!,
      untilDate: pausedDates[pausedDates.length - 1]!,
      isIndefinite: false,
      deliveryDates: pausedDates,
      releasedDates: [],
      // Closed on insert. The live set is deliveries.status, not an open vacation row.
      resumedAt: new Date(),
      createdBy: actorId,
    });
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "paused",
      note: pausedDates.join(", "),
      createdBy: actorId,
    });
    removed = eligible
      .filter((r) => updated.some((u) => u.id === r.id))
      .map((r) => ({ publicId: r.publicId, routeSyncedAt: r.routeSyncedAt }));
    // Past cutoff by the time the server looked: say so rather than let the caller claim them.
    const skipped = wanted.filter((d) => byDate.get(d)!.cutoffAt <= now && !pausedDates.includes(d));
    return { paused: pausedDates, skipped };
  });
  await removeStopsBestEffort(removed);
  publishAnalyticsLive();
  return result;
}

/** Put paused days back on the same dates. "all" is every paused day still before cutoff. */
export async function releasePausedDays(orderPublicId: string, dates: string[] | "all", actorId: bigint | null): Promise<string[]> {
  const order = await orderByPublicId(orderPublicId);
  if (order.status !== "active" && order.status !== "paused") {
    throw new ValidationError(`Cannot resume an order that is ${order.status}`);
  }
  const wanted = dates === "all" ? null : uniqueDates(dates);

  const resumed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
    await lapsePausedRows(tx, order.id);
    return releasePausedRows(tx, order.id, wanted, actorId);
  });
  await restoreStopsBestEffort(order.id, resumed, actorId);
  publishAnalyticsLive();
  return resumed;
}

/**
 * A paused day whose cutoff has passed did not go out. It becomes a hold (never put back on the
 * schedule). Safe to call from a read: it takes the order's lock in its own transaction and
 * converts each row once.
 */
export async function lapseElapsedPauses(orderId: bigint): Promise<number> {
  let retired = false;
  const n = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    retired = await retireLegacyPaused(tx, orderId);
    return lapsePausedRows(tx, orderId);
  });
  if (n > 0 || retired) publishAnalyticsLive();
  return n;
}

const log = createLogger("pause-days");

/** For reads: a failed conversion is logged and the next read retries; the page renders the rows as they are. */
export async function lapseElapsedPausesSafe(orderId: bigint): Promise<number> {
  try {
    return await lapseElapsedPauses(orderId);
  } catch (err) {
    log.error({ err, orderId: String(orderId) }, "lapse elapsed pauses failed");
    return 0;
  }
}

/**
 * Every order with a paused day past its cutoff, whatever the order's status, plus every order
 * still marked paused (retired to active). One order failing is logged and skipped so the rest still convert.
 */
export async function lapseAllElapsedPauses(): Promise<{ checked: number; lapsed: number; failed: number }> {
  const stranded = await db.selectDistinct({ id: orders.id }).from(orders)
    .leftJoin(deliveries, and(eq(deliveries.orderId, orders.id), CUSTOMER_PAUSED, lte(deliveries.cutoffAt, Date.now())))
    .where(or(eq(orders.status, "paused"), isNotNull(deliveries.id)));
  let lapsed = 0;
  let failed = 0;
  for (const o of stranded) {
    try {
      lapsed += await lapseElapsedPauses(o.id);
    } catch (err) {
      failed++;
      log.error({ err, orderId: String(o.id) }, "lapse elapsed pauses failed");
    }
  }
  return { checked: stranded.length, lapsed, failed };
}

/** What the pause drawer can offer: upcoming original days that are still pausable or still resumable. */
export async function listPauseDays(orderId: bigint): Promise<{ date: string; paused: boolean }[]> {
  const rows = await db.select({ date: deliveries.deliveryDate, status: deliveries.status }).from(deliveries).where(and(
    eq(deliveries.orderId, orderId),
    or(eq(deliveries.status, "scheduled"), CUSTOMER_PAUSED),
    isNull(deliveries.makeupForDeliveryId),
    gt(deliveries.cutoffAt, Date.now()),
    not(MOVED_AWAY),
    not(CARRIES_MOVED_IN),
  )).orderBy(asc(deliveries.deliveryDate));
  return rows.map((r) => ({ date: r.date, paused: r.status === "paused" }));
}
