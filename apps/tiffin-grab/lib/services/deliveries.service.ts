import { ValidationError, cutoffMsFor, parseIsoDateUtc, weekdayKey, zonedDateIso } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, deliveryExtraTiffins, deliveryFrequencies, deliveryMoves, deliveryZones, orderActivities, orders } from "@/db/schema";
import { mealSizeServesWeekends } from "./weekend-dish";
import { getAppSettings } from "./app-settings.service";
import { orderDeliveryDays, planWeek, weekendDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates } from "@/lib/menu/delivery-dates";
import { trialDeliveryDates } from "@/lib/trial/schedule";
import { MAX_TIFFINS_PER_TRIP, countsToCoverage, coveredDates, dateCounts, mergeBlockReason, mergeCoverage, shiftTiffin, swapAppliesTo, tiffinTotal, tripCoverage } from "@/lib/menu/coverage";
import { loadExtraDates } from "@/lib/services/delivery-extras";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import { findZone } from "@/lib/catalog/zone-match";
import type { AddressInput, AddressScope } from "@foundry/address";
import { addressService } from "@/lib/services/addresses.service";
import { resolveDropOff, setAddressDropOff } from "./address-drop-off.service";
import type { DropOffValue } from "@/lib/catalog/drop-off";
import { deleteOrder } from "@/lib/services/optimoroute/client";
import { publishAnalyticsLive } from "@/lib/realtime/publish-inbox";

const log = createLogger("deliveries.service");

async function assertOrderNotTrial(tx: Tx, orderId: bigint): Promise<void> {
  const [row] = await tx.select({ trialLength: orders.trialLength }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (row?.trialLength != null) throw new ValidationError("A trial can only have its dishes edited.");
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof orders.$inferSelect;
type Delivery = typeof deliveries.$inferSelect;

const WEEKEND = new Set(["sat", "sun"]);

/** ISO date `n` days before `dateIso` — UTC date math, same style as nextDeliveryDateAfter. */
function isoDaysBefore(dateIso: string, n: number): string {
  const d = parseIsoDateUtc(dateIso);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Carries one delivery's applied swaps onto its replacement. Used by reschedule,
 * where the SAME day moves: a per-day override the customer made must survive
 * the move rather than snapping back to the subscription default.
 */
export async function copyDeliverySwaps(
  tx: Tx,
  fromDeliveryId: bigint,
  toDeliveryId: bigint,
  /** Date a NULL for_date resolves to on the copy. Pass the source's own date whenever the copy's
   *  own date differs from it, or the swap would silently move to another eating day. */
  resolveNullTo?: string,
): Promise<void> {
  const rows = await tx.select().from(deliveryCategorySwaps)
    .where(eq(deliveryCategorySwaps.deliveryId, fromDeliveryId)).orderBy(asc(deliveryCategorySwaps.id));
  if (rows.length === 0) return;
  await tx.insert(deliveryCategorySwaps).values(rows.map((r) => ({
    deliveryId: toDeliveryId,
    fromCategory: r.fromCategory,
    toCategory: r.toCategory,
    qtyFrom: r.qtyFrom,
    qtyTo: r.qtyTo,
    fromRow: r.fromRow,
    receiveTu: r.receiveTu,
    forDate: r.forDate ?? resolveNullTo ?? null,
  })));
}

/**
 * Materializes the delivery-drop rows for an order. Tiffin total is unaffected by this
 * function (pricing already fixed order.tiffinCount at checkout using deliveryDays.length,
 * weekend days included) — this only decides how that total is DISTRIBUTED across rows.
 *
 * There is no physical Saturday/Sunday route: a weekend add-on ships with the same week's
 * Friday instead, so a "sat"/"sun" entry never gets its own row — it adds `persons` tiffin
 * units onto that Friday's row (tiffinUnits) instead. Friday is always a base delivery day
 * (both "mwf" and the 5-day pattern include it), so the Friday row it bundles onto is
 * guaranteed to already exist earlier in the same walk — the fallback branch below is a
 * defensive backstop, not the expected path, so a bundle target is never silently dropped.
 *
 * Idempotent: returns 0 and inserts nothing if the order already has deliveries. Caller
 * supplies the transaction; this is a write path only, called from both routes that put an
 * order into "active".
 */
export async function materializeDeliveries(tx: Tx, order: Order): Promise<number> {
  const [existing] = await tx.select({ id: deliveries.id }).from(deliveries)
    .where(eq(deliveries.orderId, order.id)).limit(1);
  if (existing) return 0;

  const [freq] = await tx.select({ key: deliveryFrequencies.key, daysPerWeek: deliveryFrequencies.daysPerWeek, weekdays: deliveryFrequencies.weekdays })
    .from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
  if (!freq) throw new ValidationError("Delivery frequency not found");

  type Row = { deliveryDate: string; tiffinUnits: number; coversDates?: string[] };
  const rows: Row[] = [];

  if (order.trialLength != null) {
    const dates = trialDeliveryDates(order.startDate, order.trialLength, order.trialWeekdays ?? []);
    for (const date of dates) rows.push({ deliveryDate: date, tiffinUnits: order.persons });
    const total = rows.reduce((n, r) => n + r.tiffinUnits, 0);
    if (total !== order.tiffinCount) {
      throw new ValidationError(`Delivery plan carries ${total} tiffins but the order is priced for ${order.tiffinCount}`);
    }
  } else if (order.eatingDays?.length) {
    // Delivery days come from the frequency row alone; eating days (weekends included)
    // ride the nearest earlier delivery, so a trip's tiffinUnits is its carried days.
    const week = planWeek(
      orderDeliveryDays({ frequencyKey: freq.key, weekdays: freq.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false }),
      order.eatingDays as DayOfWeek[],
    );
    if (!week) throw new ValidationError("An eating day falls before the first delivery day of this frequency");
    const unitsByDay = new Map(week.map((t) => [t.day, t.units]));
    const dates = subscriptionDeliveryDates({ startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays: week.map((t) => t.day) });
    const carriedByDay = new Map(week.map((t) => [t.day, t.days]));
    for (const d of dates) {
      rows.push({
        deliveryDate: d.dateIso,
        tiffinUnits: unitsByDay.get(d.dayOfWeek)! * order.persons,
        coversDates: tripCoverage(d.dateIso, d.dayOfWeek, carriedByDay.get(d.dayOfWeek)!),
      });
    }
    const total = rows.reduce((n, r) => n + r.tiffinUnits, 0);
    if (total !== order.tiffinCount) {
      throw new ValidationError(`Delivery plan carries ${total} tiffins but the order is priced for ${order.tiffinCount}`);
    }
  } else {
    const deliveryDays = orderDeliveryDays({
      frequencyKey: freq.key,
      weekdays: freq.weekdays as DayOfWeek[] | null,
      includeSaturday: order.includeSaturday,
      includeSunday: order.includeSunday,
    });

    // orderDeliveryDays hardcodes 3 weekdays for "mwf" and 5 otherwise, independent of the
    // frequency row. If an admin edits daysPerWeek, pricing's tiffinCount and the row count
    // silently diverge — refuse to create a subscription whose rows contradict its price.
    const baseDays = deliveryDays.filter((d) => !WEEKEND.has(d)).length;
    if (baseDays !== freq.daysPerWeek) {
      throw new ValidationError(
        `Frequency "${freq.key}" declares ${freq.daysPerWeek} days/week but resolves to ${baseDays}`,
      );
    }

    const dates = subscriptionDeliveryDates({
      startDate: order.startDate,
      durationWeeks: order.durationWeeks,
      deliveryDays,
    });

    const rowByDate = new Map<string, Row>();
    for (const d of dates) {
      if (d.dayOfWeek === "sat" || d.dayOfWeek === "sun") {
        const fridayIso = isoDaysBefore(d.dateIso, d.dayOfWeek === "sat" ? 1 : 2);
        const friday = rowByDate.get(fridayIso);
        if (friday) {
          friday.tiffinUnits += order.persons;
          continue;
        }
        // Shouldn't happen (Friday is always a base day) — don't drop a real customer's
        // tiffin over it, just give the weekend day its own row instead of merging.
      }
      const newRow: Row = { deliveryDate: d.dateIso, tiffinUnits: order.persons };
      rows.push(newRow);
      rowByDate.set(d.dateIso, newRow);
    }
  }

  const { timezone, cutoffHour } = await getAppSettings();
  await tx.insert(deliveries).values(rows.map((r) => ({
    orderId: order.id,
    deliveryDate: r.deliveryDate,
    status: "scheduled" as const,
    cutoffAt: cutoffMsFor(r.deliveryDate, cutoffHour, timezone),
    tiffinUnits: r.tiffinUnits,
    coversDates: r.coversDates ?? null,
  })));
  return rows.length;
}

/**
 * Visible deliveries for an order within [from, until] (inclusive), ordered by date.
 * Only `status = 'scheduled'` rows are visible — paused/skipped/cancelled rows vanish.
 * Read-only: this must NEVER reconcile or write. Callers (grid, selection validation) rely
 * on that to run safely inside async Server Components.
 */
export async function visibleDeliveries(orderId: bigint, from: string, until: string): Promise<Delivery[]> {
  return db.select().from(deliveries).where(and(
    eq(deliveries.orderId, orderId),
    eq(deliveries.status, "scheduled"),
    gte(deliveries.deliveryDate, from),
    lte(deliveries.deliveryDate, until),
  )).orderBy(asc(deliveries.deliveryDate));
}

/**
 * Every delivery row for an order (all statuses, originals and make-ups alike), for the admin
 * panel. Unlike visibleDeliveries this is not customer-facing and must not hide paused/skipped/
 * cancelled rows. Read-only: never reconciles.
 */
export async function listDeliveries(orderId: bigint): Promise<Delivery[]> {
  return db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(asc(deliveries.deliveryDate));
}

/** Rows past their snapshotted cutoff are immutable. cutoff_at is never re-derived. */
export function assertMutable(row: Delivery): void {
  if (Date.now() > row.cutoffAt) {
    throw new ValidationError("This delivery is locked — its cutoff has passed");
  }
}

function assertOriginal(row: Delivery): void {
  // A make-up cannot itself be skipped or paused: that would spawn a make-up of a make-up and
  // grow the tail without bound.
  if (row.makeupForDeliveryId !== null) {
    throw new ValidationError("A make-up delivery cannot be skipped or paused");
  }
}

// Exported so category-swaps.service.ts can reuse this pre-lock/load shape rather
// than duplicating it.
export async function loadByPublicId(tx: Tx, publicId: string): Promise<Delivery> {
  const [row] = await tx.select().from(deliveries).where(eq(deliveries.publicId, publicId)).limit(1);
  if (!row) throw new ValidationError("Delivery not found");
  return row;
}

/** Pre-lock lookup: only orderId, so we know what to lock before trusting any other column. */
export async function loadOrderIdByPublicId(tx: Tx, publicId: string): Promise<bigint> {
  const [row] = await tx.select({ orderId: deliveries.orderId }).from(deliveries)
    .where(eq(deliveries.publicId, publicId)).limit(1);
  if (!row) throw new ValidationError("Delivery not found");
  return row.orderId;
}

/** Pre-lock lookup by the order's own public_id, so we know what to lock before reading anything else. */
async function loadOrderIdByOrderPublicId(tx: Tx, orderPublicId: string): Promise<bigint> {
  const [row] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.publicId, orderPublicId)).limit(1);
  if (!row) throw new ValidationError("Order not found");
  return row.id;
}

/**
 * Marks every future scheduled original in [from, until] as paused. Make-ups (non-null
 * makeupForDeliveryId) are immutable and simply excluded, never a reason to reject. Rows already
 * past their own snapshotted cutoff are likewise excluded, not rejected — a range that lands
 * entirely in the past, or matches nothing at all, is a successful no-op returning 0.
 */
export async function pauseRange(orderPublicId: string, from: string, until: string): Promise<number> {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(from) || !isoDateRegex.test(until)) {
    throw new ValidationError("Pause dates must be ISO YYYY-MM-DD");
  }
  if (from > until) throw new ValidationError("Pause start must be on or before pause end");

  let orderId: bigint;
  let pausedRows: OptimoSyncedRow[] = [];
  const updatedCount = await db.transaction(async (tx) => {
    orderId = await loadOrderIdByOrderPublicId(tx, orderPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const updated = await tx.update(deliveries)
      .set({ status: "paused" })
      .where(and(
        eq(deliveries.orderId, orderId),
        eq(deliveries.status, "scheduled"),
        isNull(deliveries.makeupForDeliveryId),
        gte(deliveries.deliveryDate, from),
        lte(deliveries.deliveryDate, until),
        gt(deliveries.cutoffAt, Date.now()),
      ))
      .returning({ id: deliveries.id, publicId: deliveries.publicId, routeSyncedAt: deliveries.routeSyncedAt });
    pausedRows = updated;
    return updated.length;
  });
  await deleteFromOptimoRouteBestEffort(pausedRows);
  if (updatedCount > 0) publishAnalyticsLive();
  return updatedCount;
}

/**
 * Reverts paused rows to scheduled. Ignores 'skipped' rows by design — skip is a deliberate
 * single-delivery act that only an explicit unskip undoes.
 *
 * Plain resume (no `fromDate`): every FUTURE paused row (cutoff not passed) comes back.
 * Resume-from (`fromDate`): only paused days on/after `fromDate` (with a future cutoff) come back.
 * Vacation has no entry point today (move-only deliveries); this stays for its redesign.
 */
export async function resumeOrder(orderPublicId: string, fromDate?: string): Promise<number> {
  if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    throw new ValidationError("Resume date must be ISO YYYY-MM-DD");
  }
  let orderId: bigint;
  const updatedCount = await db.transaction(async (tx) => {
    orderId = await loadOrderIdByOrderPublicId(tx, orderPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const conds = [
      eq(deliveries.orderId, orderId),
      eq(deliveries.status, "paused"),
      gt(deliveries.cutoffAt, Date.now()),
    ];
    if (fromDate) conds.push(gte(deliveries.deliveryDate, fromDate));

    const updated = await tx.update(deliveries)
      .set({ status: "scheduled" })
      .where(and(...conds))
      .returning({ id: deliveries.id });
    return updated.length;
  });
  publishAnalyticsLive();
  return updatedCount;
}

/**
 * Marks a scheduled delivery as not delivered (a failed or never-confirmed drop). Customers can't
 * hold days any more; each tiffin on the row stays movable once with rescheduleDelivery.
 */
export async function skipDelivery(
  deliveryPublicId: string,
  actorId: bigint | null,
  opts: { bypassCutoffLock?: boolean } = {},
): Promise<{ missedDates: string[] }> {
  let orderId: bigint;
  let syncedRow: OptimoSyncedRow | null = null;
  let missedDates: string[] = [];
  await db.transaction(async (tx) => {
    orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertOriginal(row);
    // The cutoff lock protects a customer from self-service-cancelling too late. It does
    // not apply when OptimoRoute has reported the stop failed (pullCompletions).
    if (!opts.bypassCutoffLock) assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot skip a ${row.status} delivery`);
    const updated = await tx.update(deliveries).set({ status: "skipped" })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
      .returning({ id: deliveries.id });
    if (updated.length === 0) throw new ValidationError(`Cannot skip a ${row.status} delivery`);
    missedDates = coveredDates(row);
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "skipped",
      note: row.coversDates ? `Missed days: ${missedDates.join(", ")}` : null,
      createdBy: actorId,
    });
    syncedRow = { publicId: row.publicId, routeSyncedAt: row.routeSyncedAt };
  });
  await deleteFromOptimoRouteBestEffort([syncedRow!]);
  publishAnalyticsLive();
  return { missedDates };
}

/** What an admin can set on one delivery. "Delivered" is not a stored status: it is scheduled
 *  plus an OptimoRoute success, which is what the tiffin count and the calendar both read. */
export type AdminDeliveryStatus = "upcoming" | "delivered" | "not_delivered";

const ADMIN_DELIVERY_STATUSES: readonly AdminDeliveryStatus[] = ["upcoming", "delivered", "not_delivered"];

export function isAdminDeliveryStatus(value: string): value is AdminDeliveryStatus {
  return (ADMIN_DELIVERY_STATUSES as readonly string[]).includes(value);
}

/**
 * Admin override for one delivery's delivered / not-delivered outcome. Ignores the cutoff lock:
 * that lock stops a customer changing a day that has already gone out, which is exactly the case
 * an admin is correcting (a completion pull skipped a day that did go out, or the reverse).
 * Does not move tiffins and does not touch the pool. A row whose tiffins already live on another
 * day is refused — editing it would count them twice.
 */
export async function adminSetDeliveryStatus(
  deliveryPublicId: string,
  status: AdminDeliveryStatus,
  actorId: bigint | null,
): Promise<void> {
  let syncedRow: OptimoSyncedRow | null = null;
  let changed = false;
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const row = await loadByPublicId(tx, deliveryPublicId);
    if (row.status === "cancelled") throw new ValidationError("A cancelled delivery cannot be changed");
    if (row.mergedIntoDeliveryId != null || row.tiffinUnits === 0) {
      throw new ValidationError("This delivery's tiffins were moved. Change the day they moved to.");
    }
    const [moved] = await tx.select({ id: deliveries.id }).from(deliveries)
      .where(eq(deliveries.makeupForDeliveryId, row.id)).limit(1);
    if (moved) throw new ValidationError("This delivery's tiffins were moved. Change the day they moved to.");

    const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.status === "cancelled" || order.status === "completed") {
      throw new ValidationError("This subscription can no longer be changed");
    }

    const now = Date.now();
    // Delivered only once confirmed (OptimoRoute or an admin); the cutoff alone proves nothing.
    // "upcoming" is the unconfirmed state: Upcoming before the cutoff, Awaiting confirmation after.
    const current: AdminDeliveryStatus | "paused" =
      row.status === "skipped" ? "not_delivered"
      : row.status === "paused" ? "paused"
      : row.optimoCompletionStatus === "success" ? "delivered"
      : "upcoming";
    if (current === status) return;

    if (status === "delivered" && row.deliveryDate > zonedDateIso(now, (await getAppSettings()).timezone)) {
      throw new ValidationError("This delivery's day hasn't come yet, so it can't be marked Delivered.");
    }

    let patch: Partial<typeof deliveries.$inferInsert>;
    let label: string;
    switch (status) {
      case "upcoming":
        patch = { status: "scheduled", optimoCompletionStatus: null, optimoCompletedAt: null, optimoCompletionNote: null };
        label = row.cutoffAt <= now ? "Awaiting confirmation" : "Upcoming";
        break;
      case "delivered":
        patch = { status: "scheduled", optimoCompletionStatus: "success", optimoCompletedAt: row.optimoCompletedAt ?? now, optimoCompletionNote: null };
        label = "Delivered";
        break;
      case "not_delivered":
        patch = {
          status: "skipped",
          ...(row.optimoCompletionStatus === "success"
            ? { optimoCompletionStatus: null, optimoCompletedAt: null, optimoCompletionNote: null }
            : {}),
        };
        label = "On hold";
        syncedRow = { publicId: row.publicId, routeSyncedAt: row.routeSyncedAt };
        break;
      default: {
        const unreachable: never = status;
        throw new ValidationError(`Unknown delivery status: ${unreachable}`);
      }
    }
    await tx.update(deliveries).set(patch).where(eq(deliveries.id, row.id));

    const activityType = status === "not_delivered" ? "skipped" : row.status === "scheduled" ? "note" : "unskipped";
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: activityType, note: `Admin set delivery status to ${label}`, createdBy: actorId,
    });
    changed = true;
  });
  if (syncedRow) await deleteFromOptimoRouteBestEffort([syncedRow]);
  if (changed) publishAnalyticsLive();
}

// Self-join alias used only to test "does a make-up already exist for this row" — a correlated
// NOT EXISTS written via a bare `${deliveries}` interpolation is not guaranteed to alias
// correctly in Drizzle's raw sql tag, so this uses a real join alias instead.
const existingMakeup = alias(deliveries, "existing_makeup");

/** A cancelled/skipped row that had already been synced to OptimoRoute — the caller's cue to
 *  also delete it there. `routeSyncedAt` null means OptimoRoute never had this stop. */
export type OptimoSyncedRow = { publicId: string; routeSyncedAt: number | null };

/**
 * Best-effort OptimoRoute cleanup for a row that just left the schedule. Never throws: a stop
 * OptimoRoute already dropped, or an API hiccup, must not block the DB change that already
 * committed — this only stops printing a label for a delivery nobody is making anymore.
 */
export async function deleteFromOptimoRouteBestEffort(rows: OptimoSyncedRow[]): Promise<void> {
  for (const row of rows) {
    if (row.routeSyncedAt == null) continue;
    try {
      await deleteOrder(row.publicId);
    } catch (e) {
      log.error({ err: e, publicId: row.publicId }, "optimoroute delete-on-cancel failed");
    }
  }
}

/**
 * Marks every scheduled/paused row (originals and make-ups alike) cancelled. Terminal: cancel()
 * never reactivates, so there is no corresponding "uncancel". Caller owns the transaction/lock —
 * this runs inside orders.service.ts cancel()'s own advisory-locked tx.
 *
 * Returns the cancelled rows' publicId/routeSyncedAt (not just a count) so the caller can clean
 * them up on OptimoRoute after the transaction commits — an external API call has no place
 * inside a DB transaction.
 */
export async function cancelDeliveries(tx: Tx, orderId: bigint): Promise<OptimoSyncedRow[]> {
  return tx.update(deliveries).set({ status: "cancelled" })
    .where(and(eq(deliveries.orderId, orderId), inArray(deliveries.status, ["scheduled", "paused"])))
    .returning({ publicId: deliveries.publicId, routeSyncedAt: deliveries.routeSyncedAt });
}

/**
 * No future non-cancelled rows and no unmaterialized make-up debt -> the subscription is done.
 * A delivered original still reads status='scheduled' (spec 2 has no 'delivered' status), so
 * "no scheduled/paused rows" is the WRONG completion test — it fires the moment every original
 * is skipped/paused (even with future cutoffs, i.e. live debt) and never fires on a happy-path
 * subscription that ran its full course (its past originals stay 'scheduled' forever). The
 * correct test: no row dated today-or-later that isn't cancelled, AND no missed original
 * (paused|skipped, makeup_for_delivery_id IS NULL) still lacking a make-up.
 */
export async function maybeComplete(orderId: bigint): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Lock before any read it guards on: without this, a concurrent reconcileMakeups can insert
    // a fresh make-up (new scheduled debt) between our reads and the update below, and we'd still
    // flip the order to "completed" out from under an outstanding delivery.
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const { timezone } = await getAppSettings();
    const today = zonedDateIso(Date.now(), timezone);

    const [{ n: outstanding }] = await tx.select({ n: sql<number>`count(*)::int` }).from(deliveries).where(and(
      eq(deliveries.orderId, orderId),
      sql`${deliveries.status} != 'cancelled'`,
      gte(deliveries.deliveryDate, today),
    ));
    if (outstanding > 0) return false;

    // Same aliased leftJoin + isNull anti-join formulation as reconcileMakeups — debt counts
    // regardless of cutoff, since a future-cutoff skipped row will still spawn a make-up later.
    const [{ n: debt }] = await tx.select({ n: sql<number>`count(*)::int` })
      .from(deliveries)
      .leftJoin(existingMakeup, eq(existingMakeup.makeupForDeliveryId, deliveries.id))
      .where(and(
        eq(deliveries.orderId, orderId),
        isNull(deliveries.makeupForDeliveryId),
        inArray(deliveries.status, ["paused", "skipped"]),
        isNull(deliveries.mergedIntoDeliveryId),
        isNull(existingMakeup.id),
      ));
    if (debt > 0) return false;

    const updated = await tx.update(orders).set({ status: "completed" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "active")))
      .returning({ id: orders.id, organizationId: orders.organizationId });
    if (updated.length === 0) return false;
    await tx.insert(orderActivities).values({
      orderId, type: "status_change", fromStatus: "active", toStatus: "completed",
      note: "Plan over: every delivery is done", organizationId: updated[0]!.organizationId,
    });
    return true;
  });
}

/**
 * Nightly sweep: closes every active order whose plan is over (maybeComplete's rules). Nothing
 * else ever flips an order to completed, so without this a finished plan stays "active" forever.
 */
export async function completeFinishedOrders(): Promise<{ checked: number; completed: number }> {
  const active = await db.select({ id: orders.id }).from(orders).where(eq(orders.status, "active"));
  let completed = 0;
  for (const o of active) if (await maybeComplete(o.id)) completed++;
  if (completed > 0) publishAnalyticsLive();
  return { checked: active.length, completed };
}

/** First ISO date strictly after `afterIso` whose weekday is in `deliveryDays`. */
export function nextDeliveryDateAfter(afterIso: string, deliveryDays: Set<string>): string {
  const d = parseIsoDateUtc(afterIso);
  for (let guard = 0; guard < 30; guard++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (deliveryDays.has(weekdayKey(d))) return d.toISOString().slice(0, 10);
  }
  throw new ValidationError("Could not find a make-up slot within 30 days");
}

async function orderDeliveryDaySet(tx: Tx, order: Order): Promise<Set<string>> {
  const [freq] = await tx.select({ key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies)
    .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
  return new Set(orderDeliveryDays({
    frequencyKey: freq!.key,
    weekdays: freq!.weekdays as DayOfWeek[] | null,
    includeSaturday: !order.eatingDays?.length && order.includeSaturday,
    includeSunday: !order.eatingDays?.length && order.includeSunday,
  }));
}

/** Extras follow the trip; a single-day trip re-dated to the picked eat day carries them there. */
function carriedExtras(extras: string[], eatingDateIso: string | null, own: string[]): string[] {
  return eatingDateIso && own.length === 1 ? extras.map(() => eatingDateIso) : extras;
}

async function replaceExtras(tx: Tx, deliveryId: bigint, eatDates: string[]): Promise<void> {
  await tx.delete(deliveryExtraTiffins).where(eq(deliveryExtraTiffins.deliveryId, deliveryId));
  if (eatDates.length) await tx.insert(deliveryExtraTiffins).values(eatDates.map((eatDate) => ({ deliveryId, eatDate })));
}

/** Drops the swaps that apply to `eatDate`: that day no longer rides this delivery. */
async function dropDeliverySwapsForDate(tx: Tx, deliveryId: bigint, tripDate: string, eatDate: string): Promise<void> {
  const rows = await tx.select({ id: deliveryCategorySwaps.id, forDate: deliveryCategorySwaps.forDate }).from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, deliveryId));
  const gone = rows.filter((r) => swapAppliesTo(r.forDate, tripDate, eatDate)).map((r) => r.id);
  if (gone.length) await tx.delete(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.id, gone));
}

/**
 * A row whose tiffins all left (merged into another trip, or replaced by a make-up) still owns
 * its date under deliveries_order_date_unique but carries nothing, which used to block every
 * later move onto that day. A move landing there revives it as a fresh, empty scheduled trip.
 */
async function reviveIfEmptied(tx: Tx, row: Delivery, cutoffAt: number): Promise<Delivery> {
  if (row.status === "scheduled") return row;
  const [child] = await tx.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.makeupForDeliveryId, row.id)).limit(1);
  if (row.mergedIntoDeliveryId == null && !child) return row;
  // The make-up keeps its tiffin but stops pointing here; delivery_moves still records the move and keeps it locked.
  if (child) await tx.update(deliveries).set({ makeupForDeliveryId: null }).where(eq(deliveries.id, child.id));
  const [revived] = await tx.update(deliveries).set({
    status: "scheduled", cutoffAt, mergedIntoDeliveryId: null, coversDates: [], tiffinUnits: 0,
    routeDriverSerial: null, routeDriverName: null, routeStopNumber: null, routeSyncedAt: null,
    optimoCompletionStatus: null, optimoCompletedAt: null, optimoCompletionNote: null,
  }).where(eq(deliveries.id, row.id)).returning();
  await replaceExtras(tx, row.id, []);
  await tx.delete(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, row.id));
  return revived!;
}

/**
 * Moves a WHOLE trip onto `targetDate` (a delivery weekday): payment-shift, re-delivery, a
 * single-tiffin reschedule. If a SCHEDULED trip already sits on targetDate
 * the tiffins merge into it (units add, coverage unions); otherwise a make-up row is inserted.
 * A single-tiffin trip moved to another eat day (`eatingDateIso`) becomes that day's tiffin and
 * takes that day's menu, so its old swaps stay behind. Never creates weekend delivery rows.
 */
async function moveTrip(
  tx: Tx,
  source: Delivery,
  targetDate: string,
  targetCutoff: number,
  eatingDateIso: string | null,
  persons: number,
  enforceCaps = true,
): Promise<{ id: bigint; merged: boolean; coversDates: string[] }> {
  const own = coveredDates(source);
  const carried = eatingDateIso && own.length === 1 ? [eatingDateIso] : own;
  const relabel = carried.length === 1 && own.length === 1 && carried[0] !== own[0];
  const [found] = await tx.select().from(deliveries)
    .where(and(eq(deliveries.orderId, source.orderId), eq(deliveries.deliveryDate, targetDate))).limit(1);
  const target = found && (await reviveIfEmptied(tx, found, targetCutoff));
  // Legacy rows (no covers_dates) keep their stored units: a bundled Friday must not drop to one day.
  const srcExtraDates = (await loadExtraDates(tx, [source.id])).get(source.id) ?? [];
  const movingExtras = carriedExtras(srcExtraDates, eatingDateIso, own);
  const explicit = (d: Delivery, extraCount: number) => (d.coversDates ? (coveredDates(d).length + extraCount) * Math.max(1, persons) : d.tiffinUnits);
  // Swaps written for the trip's own date (NULL for_date) must follow the day they were for.
  const nullFollows = source.coversDates || eatingDateIso == null ? source.deliveryDate : eatingDateIso;

  if (!target) {
    const covers = carried;
    const [inserted] = await tx.insert(deliveries).values({
      orderId: source.orderId,
      deliveryDate: targetDate,
      status: "scheduled",
      cutoffAt: targetCutoff,
      makeupForDeliveryId: source.id,
      tiffinUnits: source.coversDates ? (covers.length + movingExtras.length) * Math.max(1, persons) : source.tiffinUnits,
      coversDates: source.coversDates || eatingDateIso ? covers : null,
    }).returning({ id: deliveries.id });
    await replaceExtras(tx, inserted.id, movingExtras);
    await replaceExtras(tx, source.id, []);
    if (!relabel) await copyDeliverySwaps(tx, source.id, inserted.id, source.coversDates ? source.deliveryDate : (eatingDateIso ?? undefined));
    return { id: inserted.id, merged: false, coversDates: covers };
  }

  if (target.status !== "scheduled") throw new ValidationError("You already have a delivery on that day");
  const incoming = new Map<string, number>();
  for (const c of [...carried, ...movingExtras]) incoming.set(c, (incoming.get(c) ?? 0) + 1);
  const targetExtras = (await loadExtraDates(tx, [target.id])).get(target.id) ?? [];
  const blocked = enforceCaps ? mergeBlockReason(dateCounts(target, targetExtras), incoming) : null;
  if (blocked) throw new ValidationError(blocked);
  const merged = new Map(dateCounts(target, targetExtras));
  for (const [k, v] of incoming) merged.set(k, (merged.get(k) ?? 0) + v);
  const { covers, extras } = countsToCoverage(merged);
  // Units add even when coverage overlaps (moving Wed's tiffin onto a Fri that already eats Fri):
  // the customer paid for both tiffins, the doubled day is recorded in delivery_extra_tiffins.
  await tx.update(deliveries).set({
    tiffinUnits: explicit(source, srcExtraDates.length) + target.tiffinUnits,
    coversDates: covers,
  }).where(eq(deliveries.id, target.id));
  await replaceExtras(tx, target.id, extras);
  await replaceExtras(tx, source.id, []);
  if (!relabel) await copyDeliverySwaps(tx, source.id, target.id, nullFollows);
  await tx.update(deliveries).set({ mergedIntoDeliveryId: target.id }).where(eq(deliveries.id, source.id));
  return { id: target.id, merged: true, coversDates: covers };
}

/**
 * One tiffin leaves a trip that carries several: eaten on `fromEat`, it becomes a tiffin eaten
 * on `toEat`, riding the trip on `targetDate` (possibly the same trip) with that day's menu.
 * The source keeps its status and every other tiffin. A scheduled trip already on targetDate
 * takes it within the 3-tiffin cap; otherwise a new row is inserted (not a make-up: the source
 * is still a live trip).
 */
async function moveOneTiffin(
  tx: Tx,
  source: Delivery,
  fromEat: string,
  toEat: string,
  targetDate: string,
  targetCutoff: number,
  persons: number,
): Promise<{ id: bigint; merged: boolean }> {
  const per = Math.max(1, persons);
  const srcCounts = dateCounts(source, (await loadExtraDates(tx, [source.id])).get(source.id) ?? []);
  const writeCounts = async (id: bigint, counts: Map<string, number>) => {
    const { covers, extras } = countsToCoverage(counts);
    await tx.update(deliveries).set({ coversDates: covers, tiffinUnits: tiffinTotal(counts) * per }).where(eq(deliveries.id, id));
    await replaceExtras(tx, id, extras);
  };
  const leftSource = shiftTiffin(srcCounts, fromEat, null);
  const dropSwaps = () => (leftSource.has(fromEat) ? Promise.resolve() : dropDeliverySwapsForDate(tx, source.id, source.deliveryDate, fromEat));

  if (targetDate === source.deliveryDate) {
    if (source.status !== "scheduled") throw new ValidationError("This delivery isn't going out. Pick another day.");
    await writeCounts(source.id, shiftTiffin(srcCounts, fromEat, toEat));
    await dropSwaps();
    return { id: source.id, merged: true };
  }

  const [found] = await tx.select().from(deliveries)
    .where(and(eq(deliveries.orderId, source.orderId), eq(deliveries.deliveryDate, targetDate))).limit(1);
  const target = found && (await reviveIfEmptied(tx, found, targetCutoff));
  let targetId: bigint;
  if (target) {
    if (target.status !== "scheduled" || target.mergedIntoDeliveryId) throw new ValidationError("You already have a delivery on that day");
    const targetCounts = dateCounts(target, (await loadExtraDates(tx, [target.id])).get(target.id) ?? []);
    const blocked = mergeBlockReason(targetCounts, new Map([[toEat, 1]]));
    if (blocked) throw new ValidationError(blocked);
    await writeCounts(target.id, shiftTiffin(targetCounts, null, toEat));
    targetId = target.id;
  } else {
    const [inserted] = await tx.insert(deliveries).values({
      orderId: source.orderId,
      deliveryDate: targetDate,
      status: "scheduled",
      cutoffAt: targetCutoff,
      tiffinUnits: per,
      coversDates: [toEat],
    }).returning({ id: deliveries.id });
    targetId = inserted.id;
  }
  await writeCounts(source.id, leftSource);
  await dropSwaps();
  return { id: targetId, merged: !!target };
}

/**
 * Runs when staff approve an e-transfer: trips whose date passed while payment was unconfirmed
 * are moved (whole, coverage kept) to the next plan weekdays after the current tail. Past-dated
 * trips are found by date, so a second run finds nothing. Caller owns the tx and should delete
 * the returned stops from OptimoRoute after commit.
 */
export async function shiftMissedDeliveries(
  tx: Tx,
  orderId: bigint,
  actorId: bigint | null,
): Promise<OptimoSyncedRow[]> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return [];

  const { timezone, cutoffHour } = await getAppSettings();
  const today = zonedDateIso(Date.now(), timezone);

  const missed = await tx.select().from(deliveries).where(and(
    eq(deliveries.orderId, orderId),
    eq(deliveries.status, "scheduled"),
    isNull(deliveries.mergedIntoDeliveryId),
    sql`${deliveries.deliveryDate} < ${today}`,
  )).orderBy(asc(deliveries.deliveryDate));
  if (missed.length === 0) return [];

  const weekdays = new Set([...(await orderDeliveryDaySet(tx, order))].filter((d) => d !== "sat" && d !== "sun"));
  const yesterday = parseIsoDateUtc(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const floor = yesterday.toISOString().slice(0, 10);

  const stops: OptimoSyncedRow[] = [];
  for (const row of missed) {
    const [{ max }] = await tx.select({ max: sql<string | null>`max(${deliveries.deliveryDate})` })
      .from(deliveries)
      .where(and(eq(deliveries.orderId, orderId), eq(deliveries.status, "scheduled"), isNull(deliveries.mergedIntoDeliveryId)));
    const tail = max && max > floor ? max : floor;
    const target = nextDeliveryDateAfter(tail, weekdays);

    await tx.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, row.id));
    const moved = await moveTrip(tx, row, target, cutoffMsFor(target, cutoffHour, timezone), null, order.persons);
    await tx.insert(orderActivities).values({
      orderId, deliveryId: moved.id, type: "pool_scheduled", createdBy: actorId,
      note: `Missed ${row.deliveryDate} while payment was unconfirmed; moved to ${target}`,
    });
    stops.push({ publicId: row.publicId, routeSyncedAt: row.routeSyncedAt });
  }
  return stops;
}

/**
 * Reschedule moves ONE eating day's tiffin, never a whole bundle. The customer picks the day
 * they want to EAT it (`eatingDateIso`); it snaps to its carrying trip (nearest earlier-or-equal
 * plan weekday — weekends ride Friday) and from then on it IS that day's tiffin: that day's
 * menu, that day's meal picks. All cutoff / past checks use the carrying trip; a trip may carry
 * at most 3 tiffins. Never writes a Saturday/Sunday delivery row.
 *
 * `sourceEatDate` says WHICH eating day's tiffin leaves (required when the trip carries more
 * than one day). The trip keeps delivering (or stays on hold with) everything else. A tiffin
 * that was itself moved in can't move again; the day's own tiffin still can.
 */
export async function rescheduleDelivery(
  deliveryPublicId: string,
  eatingDateIso: string,
  actorId: bigint | null,
  sourceEatDate: string | null = null,
): Promise<{ merged: boolean; carriedOn: string }> {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(eatingDateIso)) throw new ValidationError("Reschedule date must be ISO YYYY-MM-DD");
  if (sourceEatDate != null && !isoDateRegex.test(sourceEatDate)) throw new ValidationError("Source date must be ISO YYYY-MM-DD");

  let oldStop: OptimoSyncedRow | null = null;
  const refreshIds: bigint[] = [];
  const result = await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    await assertOrderNotTrial(tx, orderId);

    const row = await loadByPublicId(tx, deliveryPublicId);
    assertOriginal(row);

    const mutableStatuses = ["scheduled", "skipped", "paused"] as const;
    if (!mutableStatuses.includes(row.status as (typeof mutableStatuses)[number])) {
      throw new ValidationError(`Cannot reschedule a ${row.status} delivery`);
    }
    if (row.status === "scheduled") {
      assertMutable(row);
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.status === "cancelled" || order.status === "completed") {
      throw new ValidationError("This subscription can no longer be rescheduled");
    }

    const [freq] = await tx.select({ key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies)
      .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = new Set(orderDeliveryDays({
      frequencyKey: freq!.key,
      weekdays: freq!.weekdays as DayOfWeek[] | null,
      includeSaturday: !order.eatingDays?.length && order.includeSaturday,
      includeSunday: !order.eatingDays?.length && order.includeSunday,
    }));
    // Trip weekdays never include sat/sun — weekend food always rides Friday (one rule
    // for legacy weekend add-ons and eating_days orders).
    const deliveryWeekdays = [...deliveryDays].filter((d) => d !== "sat" && d !== "sun") as DayOfWeek[];
    const carriedOn = carryTripDateIso(eatingDateIso, deliveryWeekdays);
    if (!carriedOn) throw new ValidationError("That day isn't on your plan");
    const weekendErr = weekendDaysError([weekdayKey(parseIsoDateUtc(eatingDateIso)) as DayOfWeek], await mealSizeServesWeekends(order.mealSizeId, tx));
    if (weekendErr) throw new ValidationError(weekendErr);

    const { timezone, cutoffHour } = await getAppSettings();
    const today = zonedDateIso(Date.now(), timezone);
    if (carriedOn < today) throw new ValidationError("Reschedule date cannot be in the past");
    const newCutoff = cutoffMsFor(carriedOn, cutoffHour, timezone);
    if (Date.now() > newCutoff) throw new ValidationError("That day's cutoff has already passed");

    const [existingMakeup] = await tx.select({ id: deliveries.id }).from(deliveries)
      .where(eq(deliveries.makeupForDeliveryId, row.id)).limit(1);
    if (existingMakeup || row.mergedIntoDeliveryId) throw new ValidationError("This delivery has already been rescheduled");
    // Make-up rows only ever carry moved tiffins.
    if (row.makeupForDeliveryId != null) throw new ValidationError("This tiffin was already moved once. It can't move again.");

    const own = coveredDates(row);
    // No source given: the trip's own day, or its only day when it no longer carries its own.
    const fromEat = sourceEatDate ?? (own.includes(row.deliveryDate) ? row.deliveryDate : own.length === 1 ? own[0]! : null);
    if (!fromEat) throw new ValidationError("Pick which day's tiffin to move.");
    const counts = dateCounts(row, (await loadExtraDates(tx, [row.id])).get(row.id) ?? []);
    if (!counts.has(fromEat)) throw new ValidationError("That day isn't part of this trip anymore.");
    if (fromEat === eatingDateIso) throw new ValidationError("Pick a different day");
    const [{ movedIn }] = await tx.select({ movedIn: sql<number>`count(*)::int` }).from(deliveryMoves)
      .where(and(eq(deliveryMoves.toDeliveryId, row.id), eq(deliveryMoves.toEatDate, fromEat)));
    if (counts.get(fromEat)! - movedIn < 1) throw new ValidationError("This tiffin was already moved once. It can't move again.");

    const whole = tiffinTotal(counts) === 1;
    let moved: { id: bigint; merged: boolean };
    if (whole) {
      if (carriedOn === row.deliveryDate && row.status === "scheduled") {
        // Same truck, other eat day (Fri's only tiffin eaten Sat instead): relabel in place.
        moved = await moveOneTiffin(tx, row, fromEat, eatingDateIso, carriedOn, newCutoff, order.persons);
      } else {
        if (carriedOn === row.deliveryDate) throw new ValidationError("This delivery isn't going out. Pick another day.");
        if (row.status === "scheduled") {
          const skipped = await tx.update(deliveries).set({ status: "skipped" })
            .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
            .returning({ id: deliveries.id });
          if (skipped.length === 0) throw new ValidationError(`Cannot reschedule a ${row.status} delivery`);
          oldStop = { publicId: row.publicId, routeSyncedAt: row.routeSyncedAt };
        }
        moved = await moveTrip(tx, row, carriedOn, newCutoff, eatingDateIso, order.persons);
      }
    } else {
      moved = await moveOneTiffin(tx, row, fromEat, eatingDateIso, carriedOn, newCutoff, order.persons);
    }
    // Re-push every synced stop whose tiffins changed: the source if it keeps delivering, the target on a merge.
    if (row.status === "scheduled" && (!whole || moved.id === row.id)) refreshIds.push(row.id);
    if (moved.merged && moved.id !== row.id) refreshIds.push(moved.id);

    await tx.insert(deliveryMoves).values({
      orderId, fromDeliveryId: row.id, toDeliveryId: moved.id, fromEatDate: fromEat, toEatDate: eatingDateIso, organizationId: row.organizationId,
    });
    const where = carriedOn === eatingDateIso ? carriedOn : `${eatingDateIso} (rides ${carriedOn})`;
    await tx.insert(orderActivities).values(
      moved.id === row.id
        ? [{ orderId, deliveryId: row.id, type: "note", note: `Moved ${fromEat}'s tiffin to ${eatingDateIso} on the same delivery`, createdBy: actorId }]
        : [
            { orderId, deliveryId: row.id, type: whole && row.status === "scheduled" ? "skipped" : "note", note: `Moved ${fromEat}'s tiffin to ${where}${moved.merged ? " (merged)" : ""}`, createdBy: actorId },
            { orderId, deliveryId: moved.id, type: "pool_scheduled", note: `${fromEat}'s tiffin from ${row.deliveryDate}, now eaten ${eatingDateIso}`, createdBy: actorId },
          ],
    );
    return { merged: moved.merged, carriedOn };
  });
  if (oldStop) await deleteFromOptimoRouteBestEffort([oldStop]);
  for (const id of refreshIds) await refreshStopBestEffort(id);
  publishAnalyticsLive();
  return result;
}

/**
 * A merge changes the target trip's units and covered days, so a stop already on OptimoRoute
 * must be re-pushed. Best-effort like the delete: the DB change already committed. Only touches
 * a stop we previously synced (routeSyncedAt set), never creates one for an unpushed day.
 * Dynamic import: push.ts imports daily-labels.service, which imports this module.
 */
async function refreshStopBestEffort(deliveryId: bigint): Promise<void> {
  try {
    const [t] = await db.select({ publicId: deliveries.publicId, deliveryDate: deliveries.deliveryDate, routeSyncedAt: deliveries.routeSyncedAt, status: deliveries.status })
      .from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
    if (!t || t.routeSyncedAt == null || t.status !== "scheduled") return;
    const { pushOneDelivery } = await import("@/lib/services/optimoroute/push");
    await pushOneDelivery(t.publicId, t.deliveryDate);
  } catch (e) {
    log.error({ err: e, deliveryId: String(deliveryId) }, "optimoroute refresh-after-merge failed");
  }
}

async function moveTripPreflight(tx: Tx, orderId: bigint, date: string): Promise<Delivery | undefined> {
  const [row] = await tx.select().from(deliveries)
    .where(and(eq(deliveries.orderId, orderId), eq(deliveries.deliveryDate, date))).limit(1);
  return row;
}

/**
 * Staff-only (the caller enforces it): OUR failure — the driver could not deliver — so the whole
 * trip is re-delivered on the order's next delivery day and merged there. Rejects with a
 * ValidationError when no eligible next day exists.
 */
export async function redeliverTrip(
  deliveryPublicId: string,
  actorId: bigint | null,
): Promise<{ targetDate: string; merged: boolean }> {
  let syncedRow: OptimoSyncedRow;
  let targetId: bigint;
  const result = await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    await assertOrderNotTrial(tx, orderId);
    const row = await loadByPublicId(tx, deliveryPublicId);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot re-deliver a ${row.status} delivery`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.status === "cancelled" || order.status === "completed") {
      throw new ValidationError("This subscription can no longer be re-delivered");
    }
    const deliveryDays = await orderDeliveryDaySet(tx, order);
    const { timezone, cutoffHour } = await getAppSettings();
    const today = zonedDateIso(Date.now(), timezone);

    let targetDate: string | null = null;
    let targetCutoff = 0;
    let cursor = row.deliveryDate;
    for (let guard = 0; guard < 30 && !targetDate; guard++) {
      try {
        cursor = nextDeliveryDateAfter(cursor, deliveryDays);
      } catch {
        break;
      }
      if (WEEKEND.has(weekdayKey(parseIsoDateUtc(cursor)))) continue;
      const cutoff = cutoffMsFor(cursor, cutoffHour, timezone);
      if (cursor < today || Date.now() > cutoff) continue;
      const occupant = await moveTripPreflight(tx, orderId, cursor);
      if (occupant && occupant.status !== "scheduled") continue;
      targetDate = cursor;
      targetCutoff = cutoff;
    }
    if (!targetDate) throw new ValidationError("No upcoming delivery day to re-deliver on");

    const skipped = await tx.update(deliveries).set({ status: "skipped" })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
      .returning({ id: deliveries.id });
    if (skipped.length === 0) throw new ValidationError("Cannot re-deliver a delivery that is no longer scheduled");

    const moved = await moveTrip(tx, row, targetDate, targetCutoff, null, order.persons, false);
    await tx.insert(orderActivities).values([
      { orderId, deliveryId: row.id, type: "skipped", note: `Re-delivered on ${targetDate} (driver could not deliver)`, createdBy: actorId },
      { orderId, deliveryId: moved.id, type: "pool_scheduled", note: `Re-delivery of ${row.deliveryDate}${moved.merged ? " (merged)" : ""}`, createdBy: actorId },
    ]);
    syncedRow = { publicId: row.publicId, routeSyncedAt: row.routeSyncedAt };
    targetId = moved.id;
    return { targetDate, merged: moved.merged };
  });
  await deleteFromOptimoRouteBestEffort([syncedRow!]);
  if (result.merged) await refreshStopBestEffort(targetId!);
  publishAnalyticsLive();
  return result;
}

/** Postal zone first, then radius circles (active zones only). Rejects an unserviced postal code. */
export async function resolveZoneId(tx: Tx, postalCode: string): Promise<bigint> {
  const rows = await tx.select({
    id: deliveryZones.id,
    name: deliveryZones.name,
    radiusKm: deliveryZones.radiusKm,
    postalPrefixes: deliveryZones.postalPrefixes,
    slotWindow: deliveryZones.slotWindow,
    active: deliveryZones.active,
  }).from(deliveryZones).where(eq(deliveryZones.active, true));
  const zones = rows.map((z) => ({ ...z, radiusKm: z.radiusKm == null ? null : Number(z.radiusKm) }));
  const hit = await findZone(zones, { postalCode });
  // Deliberately asymmetric with createOrder, which WAITLISTS an unmatched postal code
  // (orders.service.ts ~line 248): an active subscription may not redirect a drop to an
  // unserviced address, whereas a brand-new order can simply wait for coverage.
  if (!hit) throw new ValidationError("We don't deliver to that postal code");
  return hit.id;
}

export async function setDeliveryAddress(
  deliveryPublicId: string,
  pick: { addressPublicId?: string; newAddress?: AddressInput; dropOff?: DropOffValue },
  scope: AddressScope,
  actorId: bigint | null,
): Promise<void> {
  const deliveryId = await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    // NOTE: no assertOriginal — re-addressing a make-up is the one mutation make-ups permit.
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot re-address a ${row.status} delivery`);

    let address = null;
    if (pick.addressPublicId) {
      address = await addressService.getRow(scope, pick.addressPublicId, tx);
    } else if (pick.newAddress) {
      address = await addressService.create(scope, pick.newAddress, { tx, ifExists: "reuse" });
    }
    // Drop-off belongs to the address: what was picked under it is saved back, for its next
    // delivery or checkout, whether the address is new or already in the book.
    if (address && pick.dropOff) await setAddressDropOff(scope, { id: address.id }, pick.dropOff, tx);

    let zoneId = null;
    if (address) {
      zoneId = await resolveZoneId(tx, address.postalCode);
    }

    // Omitted = keep this delivery's drop-off; no tag = none at this address.
    const dropOff = pick.dropOff ? await resolveDropOff(pick.dropOff, tx) : undefined;

    // A saved address may carry no recipient name; fall back to the plan's.
    const [plan] = await tx.select({ fullName: orders.fullName }).from(orders).where(eq(orders.id, orderId)).limit(1);
    // Per-delivery changes are never charged: no pricing or ledger writes here.
    const updated = await tx.update(deliveries).set({
      ...(address ? {
        addressId: address.id,
        fullName: address.fullName ?? plan?.fullName ?? null,
        addressLine: address.addressLine,
        addressUnit: address.addressUnit,
        city: address.city,
        postalCode: address.postalCode,
        deliveryInstructions: address.deliveryInstructions,
        zoneId,
      } : {}),
      ...(dropOff ? { deliveryTagId: dropOff.tagId, deliveryStrategyIds: dropOff.strategyIds } : {}),
    })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
      .returning({ id: deliveries.id });
    if (updated.length === 0) throw new ValidationError(`Cannot re-address a ${row.status} delivery`);
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "delivery_address_changed", createdBy: actorId,
    });
    return row.id;
  });
  await refreshStopBestEffort(deliveryId);
}

export async function clearDeliveryAddress(deliveryPublicId: string, actorId: bigint | null): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot re-address a ${row.status} delivery`);
    const updated = await tx.update(deliveries)
      .set({
        addressId: null, fullName: null, addressLine: null, addressUnit: null, city: null, postalCode: null,
        deliveryInstructions: null, deliveryTagId: null, deliveryStrategyIds: [], addressTagId: null, zoneId: null,
      })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
      .returning({ id: deliveries.id });
    if (updated.length === 0) throw new ValidationError(`Cannot re-address a ${row.status} delivery`);
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "delivery_address_changed", createdBy: actorId,
    });
  });
}

/** addressLine NULL means "inherit the order's address". */
export function effectiveAddress(
  d: Delivery,
  order: Pick<Order, "fullName" | "addressLine" | "city" | "postalCode" | "zoneId"> &
    Partial<Pick<Order, "addressUnit" | "deliveryInstructions" | "deliveryTagId" | "deliveryStrategyIds">>,
) {
  return d.addressLine === null
    ? {
        fullName: order.fullName, addressLine: order.addressLine, addressUnit: order.addressUnit ?? null, city: order.city,
        postalCode: order.postalCode, deliveryInstructions: order.deliveryInstructions ?? null, zoneId: order.zoneId,
        deliveryTagId: order.deliveryTagId ?? null,
        deliveryStrategyIds: order.deliveryStrategyIds ?? [],
      }
    : {
        fullName: d.fullName!, addressLine: d.addressLine, addressUnit: d.addressUnit, city: d.city!,
        postalCode: d.postalCode!, deliveryInstructions: d.deliveryInstructions, zoneId: d.zoneId,
        // A re-addressed delivery carries its address's own drop-off, or none: the plan's
        // belongs to the plan's address, not this one.
        deliveryTagId: d.deliveryTagId, deliveryStrategyIds: d.deliveryStrategyIds,
      };
}
