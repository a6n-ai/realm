import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, not, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, subscriptionPauses } from "@/db/schema";
import { deleteFromOptimoRouteBestEffort, type OptimoSyncedRow } from "./deliveries.service";
import { applyHolidaysToOrder } from "./holiday-apply";
import { assertDaysPauseAllowed } from "./pause-limits.service";
import { autoMovePausedOn, moveLapsedPausesToEnd } from "./pause-auto-move";
import { CUSTOMER_PAUSED, MOVED_AWAY, isLapsedPause, lapsePausedRows, lapsedPauseDates, pauseRows, releasePausedRows, restoreStopsBestEffort, retireLegacyPaused } from "./pause-state";
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
      // Closed on insert. The live set is deliveries.status, not an open pause row.
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
  return (await releasePausedDaysDetailed(orderPublicId, dates, actorId)).resumed;
}

/** A resumed day that landed on a declared holiday and was closed again in the same step. */
export type ReclosedDay = { date: string; holidayName: string; placed: boolean };

/** `releasePausedDays` plus the days a holiday closed again, so the caller can say so instead of "nothing resumed". */
export async function releasePausedDaysDetailed(orderPublicId: string, dates: string[] | "all", actorId: bigint | null): Promise<{ resumed: string[]; reclosed: ReclosedDay[] }> {
  const order = await orderByPublicId(orderPublicId);
  if (order.status !== "active" && order.status !== "paused") {
    throw new ValidationError(`Cannot resume an order that is ${order.status}`);
  }
  const wanted = dates === "all" ? null : uniqueDates(dates);

  let closed: OptimoSyncedRow[] = [];
  let reclosed: ReclosedDay[] = [];
  const resumed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
    await lapsePausedRows(tx, order.id);
    const dates = await releasePausedRows(tx, order.id, wanted, actorId);
    // A day resumed onto a declared holiday is closed again at once: free this time (the release
    // refunded the pause day) and with its extra day added.
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    const applied = fresh ? await applyHolidaysToOrder(tx, fresh, actorId) : [];
    closed = applied.map((x) => ({ publicId: x.deliveryPublicId, routeSyncedAt: x.routeSyncedAt }));
    const closedAgain = new Set(applied.map((x) => x.date));
    reclosed = applied.filter((x) => dates.includes(x.date)).map((x) => ({ date: x.date, holidayName: x.holidayName, placed: x.needsPlacing == null }));
    return dates.filter((d) => !closedAgain.has(d));
  });
  await removeStopsBestEffort(closed.filter((r) => r.routeSyncedAt != null));
  if (resumed.length > 0) await restoreStopsBestEffort(order.id, resumed, actorId);
  publishAnalyticsLive();
  return { resumed, reclosed };
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
  // The plan's switch sends these new holds straight to the end; its own transactions, after this one commits.
  if (n > 0 && (await autoMovePausedOn(db, orderId))) await moveLapsedPausesToEnd(orderId);
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
  // Holds that lapsed before the switch went on, or that found no free day last time, get another go.
  const switchedOn = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.autoMovePaused, true), eq(orders.status, "active")));
  for (const o of switchedOn) await moveLapsedPausesToEnd(o.id);
  return { checked: stranded.length, lapsed, failed };
}

export type PauseDay = { date: string; paused: boolean; /** Paused and past its cutoff: Move only, never Resume. */ lapsed?: true };

/**
 * What the pause drawer can offer: upcoming days (make-ups and days carrying a moved tiffin
 * included) that are still pausable or still resumable, plus paused days past their cutoff whose tiffin has not been moved yet.
 */
export async function listPauseDays(orderId: bigint): Promise<PauseDay[]> {
  const now = Date.now();
  const rows = await db.select({ date: deliveries.deliveryDate, status: deliveries.status, cutoffAt: deliveries.cutoffAt, routeSyncedAt: deliveries.routeSyncedAt })
    .from(deliveries).where(and(
      eq(deliveries.orderId, orderId),
      not(MOVED_AWAY),
      or(
        and(or(eq(deliveries.status, "scheduled"), CUSTOMER_PAUSED), gt(deliveries.cutoffAt, now)),
        and(CUSTOMER_PAUSED, lte(deliveries.cutoffAt, now)),
        and(eq(deliveries.status, "skipped"), isNull(deliveries.holidayId)),
      ),
    )).orderBy(asc(deliveries.deliveryDate));
  const lapsed = rows.some((r) => r.status === "skipped") ? (await lapsedPauseDates(db, [orderId])).get(orderId) : undefined;
  return rows.flatMap((r): PauseDay[] => {
    if (r.status === "skipped") return isLapsedPause({ status: r.status, deliveryDate: r.date, routeSyncedAt: r.routeSyncedAt }, lapsed) ? [{ date: r.date, paused: true, lapsed: true }] : [];
    if (r.cutoffAt <= now) return [{ date: r.date, paused: true, lapsed: true }];
    return [{ date: r.date, paused: r.status === "paused" }];
  });
}
