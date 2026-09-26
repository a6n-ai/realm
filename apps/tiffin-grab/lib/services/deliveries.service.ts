import { ValidationError, cutoffMsFor, parseIsoDateUtc, weekdayKey, zonedDateIso } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, deliveryExtraTiffins, deliveryFrequencies, deliveryZones, orderActivities, orders } from "@/db/schema";
import { getAppSettings } from "./app-settings.service";
import { orderDeliveryDays, planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates } from "@/lib/menu/delivery-dates";
import { MAX_TIFFINS_PER_TRIP, coveredDates, dateCounts, mergeBlockReason, mergeCoverage, movesOneEatDay, swapAppliesTo, tripCoverage } from "@/lib/menu/coverage";
import { loadExtraDates } from "@/lib/services/delivery-extras";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import { findZone } from "@/lib/catalog/zone-match";
import { deleteOrder } from "@/lib/services/optimoroute/client";

const log = createLogger("deliveries.service");

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
    .where(eq(deliveryCategorySwaps.deliveryId, fromDeliveryId));
  if (rows.length === 0) return;
  await tx.insert(deliveryCategorySwaps).values(rows.map((r) => ({
    deliveryId: toDeliveryId,
    fromCategory: r.fromCategory,
    toCategory: r.toCategory,
    qtyFrom: r.qtyFrom,
    qtyTo: r.qtyTo,
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

  if (order.eatingDays?.length) {
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
  // reconcilePoolFromMisses opens its own transaction and takes its own advisory lock — must run
  // after this one commits, never nested inside it.
  await reconcilePoolFromMisses(orderId!);
  return updatedCount;
}

/**
 * Reverts paused rows to scheduled. Ignores 'skipped' rows by design — skip is a deliberate
 * single-delivery act that only an explicit unskip undoes.
 *
 * Plain resume (no `fromDate`): every FUTURE paused row (cutoff not passed) comes back; a paused
 * row already past its cutoff is a terminal miss and is left for reconcilePoolFromMisses to pool.
 *
 * Resume-from (`fromDate`): only paused days on/after `fromDate` (with a future cutoff) come back.
 * Every earlier paused day — and any whose cutoff already passed — is abandoned to the remain pool,
 * so the customer reschedules those tiffins after their last delivery.
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
  // Resume-from deliberately leaves earlier/expired paused days behind — pool ALL of them (any
  // cutoff), not just the past-cutoff ones reconcilePoolFromMisses would catch.
  if (fromDate) await poolAllPausedMisses(orderId!);
  await reconcilePoolFromMisses(orderId!);
  return updatedCount;
}

/**
 * Pools every still-paused ORIGINAL (any cutoff) not yet pooled and without a make-up child — used
 * by resume-from, where the days before the chosen resume date are abandoned on purpose. Same
 * pooled_at + pooled_tiffin_count bookkeeping as reconcilePoolFromMisses, minus the cutoff gate.
 */
async function poolAllPausedMisses(orderId: bigint): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.status === "cancelled" || order.status === "completed") return 0;

    const missed = await tx.select({ id: deliveries.id, tiffinUnits: deliveries.tiffinUnits })
      .from(deliveries)
      .leftJoin(existingMakeup, eq(existingMakeup.makeupForDeliveryId, deliveries.id))
      .where(and(
        eq(deliveries.orderId, orderId),
        isNull(deliveries.makeupForDeliveryId),
        eq(deliveries.status, "paused"),
        isNull(deliveries.pooledAt),
        isNull(deliveries.mergedIntoDeliveryId),
        isNull(existingMakeup.id),
      ));
    if (missed.length === 0) return 0;

    const now = Date.now();
    let pooledTiffins = 0;
    for (const src of missed) {
      const stamped = await tx.update(deliveries).set({ pooledAt: now })
        .where(and(eq(deliveries.id, src.id), isNull(deliveries.pooledAt)))
        .returning({ id: deliveries.id });
      if (stamped.length === 0) continue;
      // A bundled Friday's miss pools its full units (e.g. Friday + a Saturday add-on = 2),
      // not a flat order.persons — the row already carries how many tiffins it was worth.
      pooledTiffins += src.tiffinUnits;
    }
    if (pooledTiffins > 0) {
      await tx.update(orders)
        .set({ pooledTiffinCount: sql`${orders.pooledTiffinCount} + ${pooledTiffins}` })
        .where(eq(orders.id, orderId));
    }
    return pooledTiffins;
  });
}

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
    // The cutoff lock protects a customer from self-service-cancelling too late — it
    // does not apply to the system's own post-cutoff reconciliation (pullCompletions),
    // which by design only ever calls this once the cutoff has already passed.
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
  await reconcilePoolFromMisses(orderId!);
  return { missedDates };
}

// Self-join alias used only to test "does a make-up already exist for this row" — a correlated
// NOT EXISTS written via a bare `${deliveries}` interpolation is not guaranteed to alias
// correctly in Drizzle's raw sql tag, so this uses a real join alias instead.
const existingMakeup = alias(deliveries, "existing_makeup");

/**
 * Move missed originals into the order's remain pool instead of auto-scheduling a make-up date.
 * A missed original is an ORIGINAL row (makeup_for_delivery_id IS NULL) whose status is
 * paused|skipped, whose snapshotted cutoff has passed, that has NOT already been pooled
 * (pooled_at IS NULL) and does NOT already have a make-up child (legacy rows from the old
 * auto-make-up path keep their date and are left alone).
 *
 * Each pooled miss stamps `pooled_at` and adds `persons` tiffins to orders.pooled_tiffin_count.
 * The customer later turns a pooled tiffin into a real date via scheduleFromPool, which is what
 * creates the make-up row — so the miss stays "debt" (miss without make-up) until then, keeping
 * maybeComplete from completing an order that still owes tiffins.
 *
 * Idempotent via pooled_at: a second run counts nothing. Returns tiffins added to the pool.
 *
 * Serialized per order by a TRANSACTION-scoped advisory lock (see db/client.ts prepare:false note).
 * NEVER call from a read path: buildMealsGrid runs inside async Server Components.
 */
export async function reconcilePoolFromMisses(orderId: bigint): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    // Defense in depth: a correctly-behaving maybeComplete never completes an order with debt,
    // so this should be unreachable — but it bounds the blast radius if that logic regresses.
    if (!order || order.status === "cancelled" || order.status === "completed") return 0;

    const missed = await tx.select({ id: deliveries.id, tiffinUnits: deliveries.tiffinUnits })
      .from(deliveries)
      .leftJoin(existingMakeup, eq(existingMakeup.makeupForDeliveryId, deliveries.id))
      .where(and(
        eq(deliveries.orderId, orderId),
        isNull(deliveries.makeupForDeliveryId), // make-ups are terminal
        inArray(deliveries.status, ["paused", "skipped"]),
        lte(deliveries.cutoffAt, Date.now()),
        isNull(deliveries.pooledAt), // not already pooled
        isNull(deliveries.mergedIntoDeliveryId), // its tiffins live on the merge target
        isNull(existingMakeup.id), // legacy auto-make-up already covers this miss — leave it
      ))
      .orderBy(asc(deliveries.deliveryDate));
    if (missed.length === 0) return 0;

    const now = Date.now();
    let pooledTiffins = 0;
    for (const src of missed) {
      const stamped = await tx.update(deliveries).set({ pooledAt: now })
        .where(and(eq(deliveries.id, src.id), isNull(deliveries.pooledAt)))
        .returning({ id: deliveries.id });
      if (stamped.length === 0) continue; // lost a race; do not double-count
      // A bundled Friday's miss pools its full units (e.g. Friday + a Saturday add-on = 2),
      // not a flat order.persons — the row already carries how many tiffins it was worth.
      pooledTiffins += src.tiffinUnits;
    }
    if (pooledTiffins > 0) {
      await tx.update(orders)
        .set({ pooledTiffinCount: sql`${orders.pooledTiffinCount} + ${pooledTiffins}` })
        .where(eq(orders.id, orderId));
    }
    return pooledTiffins;
  });
}

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
      .returning({ id: orders.id });
    return updated.length > 0;
  });
}

/**
 * Turn pooled tiffins into a real delivery. Customer picks the day they want to EAT; that
 * snaps to the carrying trip (weekends → Friday). Creates or merges onto that trip — never
 * a weekend delivery row.
 */
export async function scheduleFromPool(
  orderPublicId: string,
  eatingDateIso: string,
  actorId: bigint | null,
): Promise<{ deliveryPublicId: string; carriedOn: string; merged: boolean }> {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(eatingDateIso)) throw new ValidationError("Schedule date must be ISO YYYY-MM-DD");

  return db.transaction(async (tx) => {
    const orderId = await loadOrderIdByOrderPublicId(tx, orderPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.status === "cancelled" || order.status === "completed") {
      throw new ValidationError("This subscription can no longer be scheduled");
    }
    if (order.pooledTiffinCount < 1) throw new ValidationError("No tiffins left to schedule");

    const [freq] = await tx.select({ key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies)
      .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryWeekdays = orderDeliveryDays({
      frequencyKey: freq!.key,
      weekdays: freq!.weekdays as DayOfWeek[] | null,
      includeSaturday: !order.eatingDays?.length && order.includeSaturday,
      includeSunday: !order.eatingDays?.length && order.includeSunday,
    }).filter((d) => d !== "sat" && d !== "sun");
    const carriedOn = carryTripDateIso(eatingDateIso, deliveryWeekdays);
    if (!carriedOn) throw new ValidationError("That day isn't on your plan");

    const [{ max }] = await tx.select({ max: sql<string | null>`max(${deliveries.deliveryDate})` })
      .from(deliveries).where(eq(deliveries.orderId, orderId));

    const { timezone, cutoffHour } = await getAppSettings();
    const today = zonedDateIso(Date.now(), timezone);
    if (carriedOn < today) throw new ValidationError("Schedule date cannot be in the past");
    const cutoff = cutoffMsFor(carriedOn, cutoffHour, timezone);
    if (Date.now() > cutoff) throw new ValidationError("That day's cutoff has already passed");

    const [miss] = await tx.select({ id: deliveries.id })
      .from(deliveries)
      .leftJoin(existingMakeup, eq(existingMakeup.makeupForDeliveryId, deliveries.id))
      .where(and(
        eq(deliveries.orderId, orderId),
        isNull(deliveries.makeupForDeliveryId),
        isNotNull(deliveries.pooledAt),
        isNull(deliveries.mergedIntoDeliveryId),
        inArray(deliveries.status, ["paused", "skipped"]),
        isNull(existingMakeup.id),
      ))
      .orderBy(asc(deliveries.deliveryDate))
      .limit(1);

    // One make-up day is worth persons tiffins, or whatever is left in the pool if that is less;
    // the same number drains the pool. The gate above (>= 1) matches so no order is stuck with a remainder.
    const units = Math.min(order.pooledTiffinCount, order.persons);
    const [occupant] = await tx.select().from(deliveries)
      .where(and(eq(deliveries.orderId, orderId), eq(deliveries.deliveryDate, carriedOn))).limit(1);

    // Merge onto an existing scheduled trip even when that trip is the plan's last
    // delivery (e.g. Sat eat-day → Fri after Friday is already the last row).
    if (occupant) {
      if (occupant.status !== "scheduled") throw new ValidationError("You already have a delivery on that day");
      const occExtras = (await loadExtraDates(tx, [occupant.id])).get(occupant.id) ?? [];
      const blocked = mergeBlockReason(dateCounts(occupant, occExtras), new Map([[eatingDateIso, 1]]));
      if (blocked) throw new ValidationError(blocked);
      const merged = dateCounts(occupant, occExtras);
      merged.set(eatingDateIso, (merged.get(eatingDateIso) ?? 0) + 1);
      const covers = [...merged.keys()].sort();
      await tx.update(deliveries).set({
        tiffinUnits: occupant.tiffinUnits + units,
        coversDates: covers,
      }).where(eq(deliveries.id, occupant.id));
      await replaceExtras(tx, occupant.id, covers.flatMap((c) => Array<string>(merged.get(c)! - 1).fill(c)));
      await tx.update(orders)
        .set({ pooledTiffinCount: sql`${orders.pooledTiffinCount} - ${units}` })
        .where(eq(orders.id, orderId));
      await tx.insert(orderActivities).values({
        orderId, deliveryId: occupant.id, type: "pool_scheduled", createdBy: actorId,
        note: `Pool eat-day ${eatingDateIso} merged onto ${carriedOn}`,
      });
      return { deliveryPublicId: occupant.publicId, carriedOn, merged: true };
    }

    if (max && carriedOn <= max) throw new ValidationError("Date must be after your last delivery");

    const [inserted] = await tx.insert(deliveries).values({
      orderId,
      deliveryDate: carriedOn,
      status: "scheduled",
      cutoffAt: cutoff,
      makeupForDeliveryId: miss?.id ?? null,
      tiffinUnits: units,
      coversDates: [eatingDateIso],
    }).returning({ id: deliveries.id, publicId: deliveries.publicId });

    await tx.update(orders)
      .set({ pooledTiffinCount: sql`${orders.pooledTiffinCount} - ${units}` })
      .where(eq(orders.id, orderId));

    await tx.insert(orderActivities).values({
      orderId, deliveryId: inserted.id, type: "pool_scheduled", createdBy: actorId,
      note: `Pool eat-day ${eatingDateIso} on trip ${carriedOn}`,
    });
    return { deliveryPublicId: inserted.publicId, carriedOn, merged: false };
  });
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

/** Moves only the swaps that apply to `eatDate` (never the whole delivery's swaps) from one delivery to another. */
async function moveDeliverySwapsForDate(tx: Tx, fromDeliveryId: bigint, toDeliveryId: bigint, tripDate: string, eatDate: string): Promise<void> {
  const rows = await tx.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, fromDeliveryId));
  const moving = rows.filter((r) => swapAppliesTo(r.forDate, tripDate, eatDate));
  if (moving.length === 0) return;
  await tx.insert(deliveryCategorySwaps).values(moving.map((r) => ({
    deliveryId: toDeliveryId, fromCategory: r.fromCategory, toCategory: r.toCategory, qtyFrom: r.qtyFrom, qtyTo: r.qtyTo, forDate: eatDate,
  })));
  await tx.delete(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.id, moving.map((r) => r.id)));
}

/**
 * Moves a trip onto `targetDate` (a delivery weekday). `sourceEatDate` says WHICH eating day is
 * moving. On a scheduled multi-day trip only that one tiffin leaves — even when it is the
 * delivery day itself — and the source keeps the remaining days, still delivered on its own
 * date. Null moves the whole trip. If a SCHEDULED trip already sits on targetDate the moving
 * day merges into it (units add, coverage unions); otherwise a make-up row is inserted.
 * Never creates weekend delivery rows.
 */
async function moveTrip(
  tx: Tx,
  source: Delivery,
  targetDate: string,
  targetCutoff: number,
  eatingDateIso: string | null,
  persons: number,
  enforceCaps = true,
  sourceEatDate: string | null = null,
): Promise<{ id: bigint; merged: boolean; coversDates: string[] }> {
  const own = coveredDates(source);
  const split = sourceEatDate != null && movesOneEatDay(own, sourceEatDate);
  const remaining = split ? own.filter((d) => d !== sourceEatDate) : [];
  const carried = split ? [sourceEatDate!] : (eatingDateIso && own.length === 1 ? [eatingDateIso] : own);
  const [target] = await tx.select().from(deliveries)
    .where(and(eq(deliveries.orderId, source.orderId), eq(deliveries.deliveryDate, targetDate))).limit(1);
  // Legacy rows (no covers_dates) keep their stored units: a bundled Friday must not drop to one day.
  const srcExtraDates = (await loadExtraDates(tx, [source.id])).get(source.id) ?? [];
  const movingExtras = split ? srcExtraDates.filter((d) => d === sourceEatDate) : carriedExtras(srcExtraDates, eatingDateIso, own);
  const stayingExtras = split ? srcExtraDates.filter((d) => d !== sourceEatDate) : [];
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
      makeupForDeliveryId: split ? null : source.id,
      tiffinUnits: source.coversDates ? (covers.length + movingExtras.length) * Math.max(1, persons) : source.tiffinUnits,
      coversDates: source.coversDates || eatingDateIso ? covers : null,
    }).returning({ id: deliveries.id });
    await replaceExtras(tx, inserted.id, movingExtras);
    if (split) {
      await tx.update(deliveries).set({
        coversDates: remaining,
        tiffinUnits: (remaining.length + stayingExtras.length) * Math.max(1, persons),
      }).where(eq(deliveries.id, source.id));
      await replaceExtras(tx, source.id, stayingExtras);
      await moveDeliverySwapsForDate(tx, source.id, inserted.id, source.deliveryDate, sourceEatDate!);
    } else {
      await replaceExtras(tx, source.id, []);
      await copyDeliverySwaps(tx, source.id, inserted.id, source.coversDates ? source.deliveryDate : (eatingDateIso ?? undefined));
    }
    return { id: inserted.id, merged: false, coversDates: covers };
  }

  if (target.status !== "scheduled") throw new ValidationError("You already have a delivery on that day");
  if (source.pooledAt != null) {
    throw new ValidationError("This delivery is in your remain pool — schedule it on a day instead");
  }
  const incoming = new Map<string, number>();
  for (const c of [...carried, ...movingExtras]) incoming.set(c, (incoming.get(c) ?? 0) + 1);
  const targetExtras = (await loadExtraDates(tx, [target.id])).get(target.id) ?? [];
  const blocked = enforceCaps ? mergeBlockReason(dateCounts(target, targetExtras), incoming) : null;
  if (blocked) throw new ValidationError(blocked);
  const merged = new Map(dateCounts(target, targetExtras));
  for (const [k, v] of incoming) merged.set(k, (merged.get(k) ?? 0) + v);
  const covers = [...merged.keys()].sort();
  const extras = covers.flatMap((c) => Array<string>(merged.get(c)! - 1).fill(c));
  // Units add even when coverage overlaps (moving Wed's tiffin onto a Fri that already eats Fri):
  // the customer paid for both tiffins, the doubled day is recorded in delivery_extra_tiffins.
  await tx.update(deliveries).set({
    tiffinUnits: (split ? (carried.length + movingExtras.length) * Math.max(1, persons) : explicit(source, srcExtraDates.length)) + target.tiffinUnits,
    coversDates: covers,
  }).where(eq(deliveries.id, target.id));
  await replaceExtras(tx, target.id, extras);
  if (split) {
    await tx.update(deliveries).set({
      coversDates: remaining,
      tiffinUnits: (remaining.length + stayingExtras.length) * Math.max(1, persons),
    }).where(eq(deliveries.id, source.id));
    await replaceExtras(tx, source.id, stayingExtras);
    await moveDeliverySwapsForDate(tx, source.id, target.id, source.deliveryDate, sourceEatDate!);
  } else {
    await replaceExtras(tx, source.id, []);
    await copyDeliverySwaps(tx, source.id, target.id, nullFollows);
    await tx.update(deliveries).set({ mergedIntoDeliveryId: target.id }).where(eq(deliveries.id, source.id));
  }
  return { id: target.id, merged: true, coversDates: covers };
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
 * Reschedule: customer picks the day they want to EAT (`eatingDateIso`). That date snaps to
 * its carrying trip (nearest earlier-or-equal frequency weekday — weekends → Friday). All
 * cutoff / past checks use the carrying trip. Existing trip on that date MERGES instead of
 * rejecting. Never writes a Saturday/Sunday delivery row.
 *
 * `sourceEatDate` says WHICH of the trip's eating days is moving. On a still-scheduled
 * multi-day trip only that tiffin leaves, even when it is the delivery day (Friday of
 * Fri+Sat+Sun). The trip keeps delivering its remaining days, never marked skipped or merged.
 * Left null, the whole trip moves. A held/paused trip always moves whole: nothing remains
 * to keep delivering.
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
  let splitSourceId: bigint | null = null;
  let targetId: bigint;
  const result = await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

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
    if (carriedOn === row.deliveryDate) {
      throw new ValidationError("Pick a different day");
    }

    const { timezone, cutoffHour } = await getAppSettings();
    const today = zonedDateIso(Date.now(), timezone);
    if (carriedOn < today) throw new ValidationError("Reschedule date cannot be in the past");
    const newCutoff = cutoffMsFor(carriedOn, cutoffHour, timezone);
    if (Date.now() > newCutoff) throw new ValidationError("That day's cutoff has already passed");

    const [existingMakeup] = await tx.select({ id: deliveries.id }).from(deliveries)
      .where(eq(deliveries.makeupForDeliveryId, row.id)).limit(1);
    if (existingMakeup || row.mergedIntoDeliveryId) throw new ValidationError("This delivery has already been rescheduled");
    const [movedIn] = await tx.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.mergedIntoDeliveryId, row.id)).limit(1);
    if (row.makeupForDeliveryId != null || movedIn) throw new ValidationError("This delivery was already moved. Only one move is allowed.");

    const own = coveredDates(row);
    if (sourceEatDate != null && !own.includes(sourceEatDate)) {
      throw new ValidationError("That day isn't part of this trip anymore.");
    }
    const willSplit = row.status === "scheduled" && sourceEatDate != null && movesOneEatDay(own, sourceEatDate);

    if (row.status === "scheduled" && !willSplit) {
      const skipped = await tx.update(deliveries).set({ status: "skipped" })
        .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
        .returning({ id: deliveries.id });
      if (skipped.length === 0) throw new ValidationError(`Cannot reschedule a ${row.status} delivery`);
    }

    const moved = await moveTrip(tx, row, carriedOn, newCutoff, eatingDateIso, order.persons, true, willSplit ? sourceEatDate : null);

    if (willSplit) {
      await tx.insert(orderActivities).values(
        moved.merged
          ? [
              { orderId, deliveryId: row.id, type: "note", note: `Moved eat-day ${sourceEatDate} off this trip onto ${carriedOn} (merged); still covers ${own.filter((d) => d !== sourceEatDate).join(", ")}`, createdBy: actorId },
              { orderId, deliveryId: moved.id, type: "pool_scheduled", note: `Merged eat-day ${sourceEatDate} from ${row.deliveryDate}; covers ${moved.coversDates.join(", ")}`, createdBy: actorId },
            ]
          : [
              { orderId, deliveryId: row.id, type: "note", note: `Moved eat-day ${sourceEatDate} off this trip onto ${carriedOn}; still covers ${own.filter((d) => d !== sourceEatDate).join(", ")}`, createdBy: actorId },
              { orderId, deliveryId: moved.id, type: "pool_scheduled", note: `Split from ${row.deliveryDate} (eat ${sourceEatDate})`, createdBy: actorId },
            ],
      );
      splitSourceId = row.id;
    } else if (moved.merged) {
      await tx.insert(orderActivities).values([
        { orderId, deliveryId: row.id, type: row.status === "scheduled" ? "skipped" : "note", note: eatingDateIso === carriedOn ? `Moved to ${carriedOn} (merged)` : `Moved eat-day ${eatingDateIso} onto ${carriedOn} (merged)`, createdBy: actorId },
        { orderId, deliveryId: moved.id, type: "pool_scheduled", note: `Merged trip from ${row.deliveryDate}; covers ${moved.coversDates.join(", ")}`, createdBy: actorId },
      ]);
    } else {
      await tx.insert(orderActivities).values(
        row.status === "scheduled"
          ? [
              { orderId, deliveryId: row.id, type: "skipped", note: `Rescheduled eat-day ${eatingDateIso} onto ${carriedOn}`, createdBy: actorId },
              { orderId, deliveryId: moved.id, type: "pool_scheduled", note: `Make-up for ${row.deliveryDate} (eat ${eatingDateIso})`, createdBy: actorId },
            ]
          : [
              { orderId, deliveryId: moved.id, type: "pool_scheduled", note: `Make-up for ${row.deliveryDate} (${row.status}, eat ${eatingDateIso})`, createdBy: actorId },
            ],
      );
    }
    if (row.status === "scheduled" && !willSplit) oldStop = { publicId: row.publicId, routeSyncedAt: row.routeSyncedAt };
    targetId = moved.id;
    return { merged: moved.merged, carriedOn };
  });
  if (oldStop) await deleteFromOptimoRouteBestEffort([oldStop]);
  if (splitSourceId) await refreshStopBestEffort(splitSourceId);
  if (result.merged) await refreshStopBestEffort(targetId!);
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
 * trip is re-delivered on the order's next delivery day and merged there. The pool is never touched.
 * Rejects with a ValidationError when no eligible next day exists, so the OptimoRoute failure
 * path can fall back to pooling.
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
  return result;
}

export async function unskipDelivery(deliveryPublicId: string, actorId: bigint | null): Promise<void> {
  let orderId: bigint;
  await db.transaction(async (tx) => {
    orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertOriginal(row);
    assertMutable(row);
    if (row.status !== "skipped") throw new ValidationError(`Cannot un-skip a ${row.status} delivery`);
    if (row.pooledAt != null) {
      throw new ValidationError("This skip is in your remain pool — schedule it on a day instead of un-skipping");
    }
    const [mk] = await tx.select({ id: deliveries.id }).from(deliveries)
      .where(eq(deliveries.makeupForDeliveryId, row.id)).limit(1);
    if (mk || row.mergedIntoDeliveryId) throw new ValidationError("This delivery has already been replaced by a make-up");
    const updated = await tx.update(deliveries).set({ status: "scheduled" })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "skipped")))
      .returning({ id: deliveries.id });
    if (updated.length === 0) throw new ValidationError(`Cannot un-skip a ${row.status} delivery`);
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "unskipped", createdBy: actorId,
    });
  });
  await reconcilePoolFromMisses(orderId!);
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
  input: { fullName: string; addressLine: string; city: string; postalCode: string },
  actorId: bigint | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    // NOTE: no assertOriginal — re-addressing a make-up is the one mutation make-ups permit.
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot re-address a ${row.status} delivery`);
    const zoneId = await resolveZoneId(tx, input.postalCode);
    const updated = await tx.update(deliveries).set({ ...input, zoneId })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
      .returning({ id: deliveries.id });
    if (updated.length === 0) throw new ValidationError(`Cannot re-address a ${row.status} delivery`);
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "delivery_address_changed", createdBy: actorId,
    });
  });
}

export async function clearDeliveryAddress(deliveryPublicId: string, actorId: bigint | null): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot re-address a ${row.status} delivery`);
    const updated = await tx.update(deliveries)
      .set({ fullName: null, addressLine: null, city: null, postalCode: null, zoneId: null })
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
    Partial<Pick<Order, "addressUnit" | "deliveryInstructions" | "deliveryStrategyId">>,
) {
  return d.addressLine === null
    ? {
        fullName: order.fullName, addressLine: order.addressLine, addressUnit: order.addressUnit ?? null, city: order.city,
        postalCode: order.postalCode, deliveryInstructions: order.deliveryInstructions ?? null, zoneId: order.zoneId,
        deliveryStrategyId: order.deliveryStrategyId ?? null,
      }
    : {
        fullName: d.fullName!, addressLine: d.addressLine, addressUnit: d.addressUnit, city: d.city!,
        postalCode: d.postalCode!, deliveryInstructions: d.deliveryInstructions, zoneId: d.zoneId,
        deliveryStrategyId: d.deliveryStrategyId ?? order.deliveryStrategyId ?? null,
      };
}
