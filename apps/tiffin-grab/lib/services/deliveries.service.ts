import { ValidationError, cutoffMsFor } from "@realm/commons";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryFrequencies, orders } from "@/db/schema";
import { getAppSettings } from "./app-settings.service";
import { orderDeliveryDays } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates } from "@/lib/menu/delivery-dates";

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

export async function skipDelivery(deliveryPublicId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
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
}

export async function unskipDelivery(deliveryPublicId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
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
}
