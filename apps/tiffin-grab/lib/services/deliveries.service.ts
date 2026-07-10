import { ValidationError, cutoffMsFor, parseIsoDateUtc, weekdayKey } from "@realm/commons";
import { and, asc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { deliveries, deliveryFrequencies, deliveryZones, orders } from "@/db/schema";
import { getAppSettings } from "./app-settings.service";
import { orderDeliveryDays } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates } from "@/lib/menu/delivery-dates";
import { matchZone } from "@/lib/catalog/postal";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof orders.$inferSelect;
type Delivery = typeof deliveries.$inferSelect;

const WEEKEND = new Set(["sat", "sun"]);

/**
 * Materializes the N delivery-drop rows for an order (N = durationWeeks × deliveryDays.length,
 * NOT tiffins — persons never multiplies row count). Idempotent: returns 0 and inserts nothing
 * if the order already has deliveries. Caller supplies the transaction; this is a write path
 * only, called from both routes that put an order into "active".
 */
export async function materializeDeliveries(tx: Tx, order: Order): Promise<number> {
  const [existing] = await tx.select({ id: deliveries.id }).from(deliveries)
    .where(eq(deliveries.orderId, order.id)).limit(1);
  if (existing) return 0;

  const [freq] = await tx.select({ key: deliveryFrequencies.key, daysPerWeek: deliveryFrequencies.daysPerWeek })
    .from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
  if (!freq) throw new ValidationError("Delivery frequency not found");

  const deliveryDays = orderDeliveryDays({
    frequencyKey: freq.key,
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

  const { timezone, cutoffHour } = await getAppSettings();
  await tx.insert(deliveries).values(dates.map((d) => ({
    orderId: order.id,
    deliveryDate: d.dateIso,
    status: "scheduled" as const,
    cutoffAt: cutoffMsFor(d.dateIso, cutoffHour, timezone),
  })));
  return dates.length;
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

async function loadByPublicId(tx: Tx, publicId: string): Promise<Delivery> {
  const [row] = await tx.select().from(deliveries).where(eq(deliveries.publicId, publicId)).limit(1);
  if (!row) throw new ValidationError("Delivery not found");
  return row;
}

/** Pre-lock lookup: only orderId, so we know what to lock before trusting any other column. */
async function loadOrderIdByPublicId(tx: Tx, publicId: string): Promise<bigint> {
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
      .returning({ id: deliveries.id });
    return updated.length;
  });
  // reconcileMakeups opens its own transaction and takes its own advisory lock — must run
  // after this one commits, never nested inside it.
  await reconcileMakeups(orderId!);
  return updatedCount;
}

/**
 * Reverts every future paused row to scheduled. Deletes nothing, and ignores 'skipped' rows by
 * design — skip is a deliberate single-delivery act that only an explicit unskip undoes. A paused
 * row already past its cutoff is a terminal miss backed by a make-up and is left untouched.
 */
export async function resumeOrder(orderPublicId: string): Promise<number> {
  let orderId: bigint;
  const updatedCount = await db.transaction(async (tx) => {
    orderId = await loadOrderIdByOrderPublicId(tx, orderPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const updated = await tx.update(deliveries)
      .set({ status: "scheduled" })
      .where(and(
        eq(deliveries.orderId, orderId),
        eq(deliveries.status, "paused"),
        gt(deliveries.cutoffAt, Date.now()),
      ))
      .returning({ id: deliveries.id });
    return updated.length;
  });
  await reconcileMakeups(orderId!);
  return updatedCount;
}

export async function skipDelivery(deliveryPublicId: string): Promise<void> {
  let orderId: bigint;
  await db.transaction(async (tx) => {
    orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertOriginal(row);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot skip a ${row.status} delivery`);
    const updated = await tx.update(deliveries).set({ status: "skipped" })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "scheduled")))
      .returning({ id: deliveries.id });
    if (updated.length === 0) throw new ValidationError(`Cannot skip a ${row.status} delivery`);
  });
  await reconcileMakeups(orderId!);
}

// Self-join alias used only to test "does a make-up already exist for this row" — a correlated
// NOT EXISTS written via a bare `${deliveries}` interpolation is not guaranteed to alias
// correctly in Drizzle's raw sql tag, so this uses a real join alias instead.
const existingMakeup = alias(deliveries, "existing_makeup");

/**
 * Append one make-up per missed original. A missed original is an ORIGINAL row
 * (makeup_for_delivery_id IS NULL) whose status is paused|skipped and whose snapshotted cutoff
 * has passed. Make-ups are terminal and are never reconciled.
 *
 * Serialized per order by a TRANSACTION-scoped advisory lock: db/client.ts sets prepare:false
 * for transaction-mode PgBouncer, where a session is not pinned across statements, so
 * pg_advisory_lock (session-scoped) would not hold. Dates are assigned one at a time,
 * re-reading max(delivery_date) after each insert, so two missed rows get distinct slots —
 * UNIQUE(makeup_for_delivery_id) alone would not prevent them colliding on
 * UNIQUE(order_id, delivery_date).
 *
 * NEVER call from a read path: buildMealsGrid runs inside async Server Components.
 */
export async function reconcileMakeups(orderId: bigint): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.status === "cancelled") return 0;

    const [freq] = await tx.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies)
      .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = new Set(orderDeliveryDays({
      frequencyKey: freq!.key,
      includeSaturday: order.includeSaturday,
      includeSunday: order.includeSunday,
    }));

    const missed = await tx.select({ id: deliveries.id })
      .from(deliveries)
      .leftJoin(existingMakeup, eq(existingMakeup.makeupForDeliveryId, deliveries.id))
      .where(and(
        eq(deliveries.orderId, orderId),
        isNull(deliveries.makeupForDeliveryId), // make-ups are terminal
        inArray(deliveries.status, ["paused", "skipped"]),
        lte(deliveries.cutoffAt, Date.now()),
        isNull(existingMakeup.id), // no make-up exists yet for this row
      ))
      .orderBy(asc(deliveries.deliveryDate));
    if (missed.length === 0) return 0;

    const { timezone, cutoffHour } = await getAppSettings();
    let created = 0;
    for (const src of missed) {
      const [{ max }] = await tx.select({ max: sql<string>`max(${deliveries.deliveryDate})` })
        .from(deliveries).where(eq(deliveries.orderId, orderId));
      const nextDate = nextDeliveryDateAfter(max, deliveryDays);
      const inserted = await tx.insert(deliveries).values({
        orderId,
        deliveryDate: nextDate,
        status: "scheduled",
        cutoffAt: cutoffMsFor(nextDate, cutoffHour, timezone),
        makeupForDeliveryId: src.id,
      }).onConflictDoNothing().returning({ id: deliveries.id });
      created += inserted.length;
    }
    return created;
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

export async function unskipDelivery(deliveryPublicId: string): Promise<void> {
  let orderId: bigint;
  await db.transaction(async (tx) => {
    orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertOriginal(row);
    assertMutable(row);
    if (row.status !== "skipped") throw new ValidationError(`Cannot un-skip a ${row.status} delivery`);
    const [mk] = await tx.select({ id: deliveries.id }).from(deliveries)
      .where(eq(deliveries.makeupForDeliveryId, row.id)).limit(1);
    if (mk) throw new ValidationError("This delivery has already been replaced by a make-up");
    const updated = await tx.update(deliveries).set({ status: "scheduled" })
      .where(and(eq(deliveries.id, row.id), eq(deliveries.status, "skipped")))
      .returning({ id: deliveries.id });
    if (updated.length === 0) throw new ValidationError(`Cannot un-skip a ${row.status} delivery`);
  });
  await reconcileMakeups(orderId!);
}

/** Prefix match against delivery_zones.postal_prefixes (active zones only). Rejects an unserviced postal code. */
export async function resolveZoneId(tx: Tx, postalCode: string): Promise<bigint> {
  const zones = await tx.select({
    id: deliveryZones.id,
    name: deliveryZones.name,
    postalPrefixes: deliveryZones.postalPrefixes,
    slotWindow: deliveryZones.slotWindow,
    active: deliveryZones.active,
  }).from(deliveryZones).where(eq(deliveryZones.active, true));
  const hit = matchZone(postalCode, zones);
  // Deliberately asymmetric with createOrder, which WAITLISTS an unmatched postal code
  // (orders.service.ts ~line 248): an active subscription may not redirect a drop to an
  // unserviced address, whereas a brand-new order can simply wait for coverage.
  if (!hit) throw new ValidationError("We don't deliver to that postal code");
  return zones.find((z) => z.name === hit.name)!.id;
}

export async function setDeliveryAddress(
  deliveryPublicId: string,
  input: { fullName: string; addressLine: string; city: string; postalCode: string },
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
  });
}

export async function clearDeliveryAddress(deliveryPublicId: string): Promise<void> {
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
  });
}

/** All-NULL override columns mean "inherit the order's address". */
export function effectiveAddress(d: Delivery, order: Order) {
  return d.addressLine === null
    ? { fullName: order.fullName, addressLine: order.addressLine, city: order.city, postalCode: order.postalCode, zoneId: order.zoneId }
    : { fullName: d.fullName!, addressLine: d.addressLine, city: d.city!, postalCode: d.postalCode!, zoneId: d.zoneId };
}
