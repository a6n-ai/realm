import { isCutoffPassed } from "@/lib/dates/cutoff";
import { cutoffPassedSql, cutoffOpenSql } from "@/lib/dates/cutoff-sql";
import { RUNNING, inOrderStatuses } from "@/lib/orders/status";
import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, isNotNull, isNull, lte, not, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, subscriptionPauses } from "@/db/schema";
import { deleteFromOptimoRouteBestEffort, type OptimoSyncedRow } from "./deliveries.service";
import { applyHolidaysToOrder } from "./holiday-apply";
import { assertDaysPauseAllowed, getPauseLimits, getPauseUsage } from "./pause-limits.service";
import { autoMovePausedOn, moveLapsedPausesToEnd, movePausedTiffinsToEnd } from "./pause-auto-move";
import { loadExtraDates } from "./delivery-extras";
import { dateCounts } from "@/lib/menu/coverage";
import type { Reader } from "./pause-state";
import { CUSTOMER_PAUSED, MOVED_AWAY, isCustomerPaused, isLapsedPause, lapsePausedRows, lapsedPauseDates, pauseRows, releasePausedRows, restoreStopsBestEffort, retireLegacyPaused } from "./pause-state";

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


type CarrierRow = typeof deliveries.$inferSelect & { movedAway: boolean };

/**
 * Each eating day → the trip that carries it. Weekend food rides Friday, so "pause Sat" is a day
 * on Friday's row, never a row of its own. A live row wins over a held or moved-away one on the
 * same eating day. `eats` lists every eating day per row (a doubled-up day once per tiffin).
 */
async function carriersFor(exec: Reader, orderId: bigint, from: string, until: string) {
  // A trip carries days up to a week after its own date.
  const earliest = new Date(`${from}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - 7);
  const rows: CarrierRow[] = await exec.select({ ...getTableColumns(deliveries), movedAway: sql<boolean>`${MOVED_AWAY}` }).from(deliveries)
    .where(and(eq(deliveries.orderId, orderId), gte(deliveries.deliveryDate, earliest.toISOString().slice(0, 10)), lte(deliveries.deliveryDate, until)))
    .orderBy(asc(deliveries.deliveryDate));
  const extras = await loadExtraDates(exec, rows.map((r) => r.id));
  const eats = new Map<bigint, Map<string, number>>(rows.map((r) => [r.id, dateCounts(r, extras.get(r.id) ?? [])]));
  const rank = (r: CarrierRow) => (r.movedAway ? 2 : r.status === "scheduled" || r.status === "paused" ? 0 : 1);
  const byEat = new Map<string, CarrierRow>();
  for (const r of [...rows].sort((a, b) => rank(a) - rank(b))) {
    for (const eat of eats.get(r.id)!.keys()) if (!byEat.has(eat)) byEat.set(eat, r);
  }
  return { byEat, eats };
}

/**
 * Pause specific upcoming delivery days. The audit row is closed immediately so another
 * pause is legal while these days are still paused. The one-open unique index stays.
 */
export async function pauseDays(orderPublicId: string, dates: string[], actorId: bigint | null): Promise<{ paused: string[]; skipped: string[] }> {
  const wanted = uniqueDates(dates);
  const order = await orderByPublicId(orderPublicId);
  if (order.trialLength != null) throw new ValidationError("A trial can only have its dishes edited.");
  if (!inOrderStatuses(RUNNING, order.status)) {
    throw new ValidationError(`Cannot pause an order that is ${order.status}`);
  }

  let removed: OptimoSyncedRow[] = [];
  let logId: bigint | null = null;
  // Eating days of a trip that keeps going out: they leave the truck after this commits.
  const partial: { deliveryPublicId: string; deliveryId: bigint; eat: string }[] = [];
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
    await lapsePausedRows(tx, order.id);
    const { byEat, eats } = await carriersFor(tx, order.id, wanted[0]!, wanted.at(-1)!);
    const missing = wanted.filter((d) => !byEat.has(d));
    if (missing.length) throw new ValidationError("That date is not a delivery on this plan");
    const now = Date.now();
    const open = (r: CarrierRow) => r.status === "scheduled" && !isCutoffPassed(r.cutoffAt, now) && !r.movedAway;
    const picked = new Map<bigint, { row: CarrierRow; days: string[] }>();
    for (const d of wanted) {
      const row = byEat.get(d)!;
      if (!open(row)) continue;
      const hit = picked.get(row.id) ?? picked.set(row.id, { row, days: [] }).get(row.id)!;
      hit.days.push(d);
    }
    if (picked.size === 0) throw new ValidationError("Cutoff has passed for those days");
    // Every eating day of the trip picked: the whole truck stops, as it always has. Some of them: only those tiffins leave.
    const whole = [...picked.values()].filter((p) => p.days.length === eats.get(p.row.id)!.size);
    for (const p of picked.values()) {
      if (whole.includes(p)) continue;
      for (const eat of p.days) {
        for (let i = 0; i < eats.get(p.row.id)!.get(eat)!; i++) partial.push({ deliveryPublicId: p.row.publicId, deliveryId: p.row.id, eat });
      }
    }
    // A whole trip spends its own date from the budget (as before); a single eating day spends that day.
    const charged = [...whole.map((p) => p.row.deliveryDate), ...new Set(partial.map((t) => t.eat))];
    await assertDaysPauseAllowed(order.id, charged, tx);

    const updated = await pauseRows(tx, whole.map((p) => p.row.id), now);
    if (updated.length === 0 && partial.length === 0) throw new ValidationError("Cutoff has passed for those days");
    const pausedTrips = updated.map((r) => r.deliveryDate);
    // ponytail: a single eating day is logged by its own date, so it shares lapsedPauseDates with a trip
    // dated the same day (Fri alone paused off Friday's truck); a held Friday later reads as a lapsed pause.
    // A `trip_date` on the log row if that ever bites.
    const logged = [...pausedTrips, ...new Set(partial.map((t) => t.eat))].sort();
    const [entry] = await tx.insert(subscriptionPauses).values({
      orderId: order.id,
      fromDate: logged[0]!,
      untilDate: logged[logged.length - 1]!,
      isIndefinite: false,
      deliveryDates: logged,
      releasedDates: [],
      // Closed on insert. The live set is deliveries.status, not an open pause row.
      resumedAt: new Date(),
      createdBy: actorId,
    }).returning({ id: subscriptionPauses.id });
    logId = entry!.id;
    const pausedEats = [
      ...whole.filter((p) => updated.some((u) => u.id === p.row.id)).flatMap((p) => p.days),
      ...new Set(partial.map((t) => t.eat)),
    ].sort();
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "paused",
      note: pausedEats.join(", "),
      createdBy: actorId,
    });
    removed = whole
      .filter((p) => updated.some((u) => u.id === p.row.id))
      .map((p) => ({ publicId: p.row.publicId, routeSyncedAt: p.row.routeSyncedAt }));
    // Past cutoff by the time the server looked: say so rather than let the caller claim them.
    const skipped = wanted.filter((d) => !pausedEats.includes(d));
    return { paused: pausedEats, skipped };
  });
  await removeStopsBestEffort(removed);
  if (partial.length === 0) return result;

  const { failed } = await movePausedTiffinsToEnd(order.id, partial, actorId);
  if (failed.length === 0) return result;
  // A tiffin that could not leave its trip still goes out: give that day back to the budget.
  const back = [...new Set(failed)];
  await db.update(subscriptionPauses).set({ releasedDates: back }).where(eq(subscriptionPauses.id, logId!));
  return { paused: result.paused.filter((d) => !back.includes(d)), skipped: [...result.skipped, ...back].sort() };
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
  if (!inOrderStatuses(RUNNING, order.status)) {
    throw new ValidationError(`Cannot resume an order that is ${order.status}`);
  }
  const picked = dates === "all" ? null : uniqueDates(dates);

  let closed: OptimoSyncedRow[] = [];
  let reclosed: ReclosedDay[] = [];
  // Eating days of a resumed trip the customer left paused: they leave the truck after commit.
  const stayPaused: { deliveryPublicId: string; deliveryId: bigint; eat: string; trip: string }[] = [];
  const eatsOfTrip = new Map<string, string[]>();
  let left: typeof stayPaused = [];
  let chargedOn: bigint | null = null;
  const resumedTrips = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
    await lapsePausedRows(tx, order.id);
    // Picked eating days → the paused trips carrying them (Sat resumes Friday's truck).
    let wanted: string[] | null = null;
    if (picked) {
      const { byEat, eats } = await carriersFor(tx, order.id, picked[0]!, picked.at(-1)!);
      const trips = new Map<string, CarrierRow>();
      for (const d of picked) {
        const row = byEat.get(d);
        if (row && isCustomerPaused(row)) trips.set(row.deliveryDate, row);
      }
      wanted = trips.size ? [...trips.keys()] : picked;
      for (const row of trips.values()) {
        const counts = eats.get(row.id)!;
        eatsOfTrip.set(row.deliveryDate, [...counts.keys()]);
        for (const [eat, n] of counts) {
          if (picked.includes(eat)) continue;
          for (let i = 0; i < n; i++) stayPaused.push({ deliveryPublicId: row.publicId, deliveryId: row.id, eat, trip: row.deliveryDate });
        }
      }
    }
    const dates = await releasePausedRows(tx, order.id, wanted, actorId);
    // A day resumed onto a declared holiday is closed again at once: free this time (the release
    // refunded the pause day) and with its extra day added.
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    const applied = fresh ? await applyHolidaysToOrder(tx, fresh, actorId) : [];
    closed = applied.map((x) => ({ publicId: x.deliveryPublicId, routeSyncedAt: x.routeSyncedAt }));
    const closedAgain = new Set(applied.map((x) => x.date));
    reclosed = applied.filter((x) => dates.includes(x.date)).map((x) => ({ date: x.date, holidayName: x.holidayName, placed: x.needsPlacing == null }));
    const back = dates.filter((d) => !closedAgain.has(d));
    left = stayPaused.filter((t) => back.includes(t.trip));
    // The release refunded the whole trip; the days still paused spend the budget again, on the
    // trip's own pause entry, so resuming one day can never move the rest for free.
    const staying = [...new Set(left.map((t) => t.eat))];
    if (staying.length) {
      const [limits, usage] = await Promise.all([getPauseLimits(order.id, tx), getPauseUsage(order.id, tx)]);
      if (limits.maxPauseDaysTotal != null && usage.daysUsed + staying.length > limits.maxPauseDaysTotal) {
        throw new ValidationError("pause days limit exceeded");
      }
      const entries = await tx.select({ id: subscriptionPauses.id, deliveryDates: subscriptionPauses.deliveryDates })
        .from(subscriptionPauses).where(eq(subscriptionPauses.orderId, order.id)).orderBy(desc(subscriptionPauses.id));
      // Only the trip's own day-set entry; a range pause (null delivery_dates) is charged by its span and never rewritten.
      const entry = entries.find((e) => e.deliveryDates != null && e.deliveryDates.some((d) => left.some((t) => t.trip === d)));
      if (entry) {
        await tx.update(subscriptionPauses).set({ deliveryDates: [...entry.deliveryDates!, ...staying] }).where(eq(subscriptionPauses.id, entry.id));
        chargedOn = entry.id;
      } else {
        const sorted = [...staying].sort();
        const [row] = await tx.insert(subscriptionPauses).values({
          orderId: order.id, fromDate: sorted[0]!, untilDate: sorted.at(-1)!, isIndefinite: false,
          deliveryDates: sorted, releasedDates: [], resumedAt: new Date(), createdBy: actorId,
        }).returning({ id: subscriptionPauses.id });
        chargedOn = row!.id;
      }
    }
    return back;
  });
  await removeStopsBestEffort(closed.filter((r) => r.routeSyncedAt != null));
  if (resumedTrips.length > 0) await restoreStopsBestEffort(order.id, resumedTrips, actorId);
  const { moved, failed } = left.length ? await movePausedTiffinsToEnd(order.id, left, actorId) : { moved: [] as string[], failed: [] as string[] };
  if (failed.length && chargedOn != null) {
    // Still on the truck: that day was not paused after all.
    const [entry] = await db.select({ releasedDates: subscriptionPauses.releasedDates }).from(subscriptionPauses).where(eq(subscriptionPauses.id, chargedOn));
    await db.update(subscriptionPauses).set({ releasedDates: [...(entry?.releasedDates ?? []), ...new Set(failed)] }).where(eq(subscriptionPauses.id, chargedOn));
  }
  // Say the eating days that came back, not the trip dates they ride on.
  const resumed = resumedTrips.flatMap((d) => (eatsOfTrip.get(d) ?? [d]).filter((eat) => !moved.includes(eat))).sort();
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
    .leftJoin(deliveries, and(eq(deliveries.orderId, orders.id), CUSTOMER_PAUSED, cutoffPassedSql(Date.now())))
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
  const rows = await db.select({ id: deliveries.id, date: deliveries.deliveryDate, coversDates: deliveries.coversDates, status: deliveries.status, cutoffAt: deliveries.cutoffAt, routeSyncedAt: deliveries.routeSyncedAt })
    .from(deliveries).where(and(
      eq(deliveries.orderId, orderId),
      not(MOVED_AWAY),
      or(
        and(or(eq(deliveries.status, "scheduled"), CUSTOMER_PAUSED), cutoffOpenSql(now)),
        and(CUSTOMER_PAUSED, cutoffPassedSql(now)),
        and(eq(deliveries.status, "skipped"), isNull(deliveries.holidayId)),
      ),
    )).orderBy(asc(deliveries.deliveryDate));
  const lapsed = rows.some((r) => r.status === "skipped") ? (await lapsedPauseDates(db, [orderId])).get(orderId) : undefined;
  const extras = await loadExtraDates(db, rows.map((r) => r.id));
  const seen = new Set<string>();
  // One day per eating day, not per trip: Sat and Sun on Friday's truck are paused on their own.
  return rows.flatMap((r): PauseDay[] => {
    const state: Omit<PauseDay, "date"> | null =
      r.status === "skipped" ? (isLapsedPause({ status: r.status, deliveryDate: r.date, routeSyncedAt: r.routeSyncedAt }, lapsed) ? { paused: true, lapsed: true } : null)
      : isCutoffPassed(r.cutoffAt, now) ? { paused: true, lapsed: true }
      : { paused: r.status === "paused" };
    if (!state) return [];
    return [...dateCounts({ deliveryDate: r.date, coversDates: r.coversDates }, extras.get(r.id) ?? []).keys()]
      .filter((date) => !seen.has(date) && seen.add(date))
      .map((date) => ({ date, ...state }));
  }).sort((a, b) => a.date.localeCompare(b.date));
}
