import { parseIsoDateUtc, ValidationError } from "@foundry/commons";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import type { Tx } from "./deliveries.service";

export type OrderWindow = { id: bigint; startDate: string; durationWeeks: number };

/**
 * Order statuses that hold real calendar days. Cancelled, completed, waitlisted and
 * pending orders deliver nothing, so they never block another plan's start date.
 */
export const DAY_RESERVING_STATUSES = ["active", "paused"] as const;

/**
 * The calendar band an active/paused order actually reserves, keyed by order id, as an
 * exclusive end date (the first day NOT reserved).
 *
 * Prefers the true last materialized delivery date over the naive
 * `startDate + durationWeeks * 7` calculation: pooled/rescheduled tiffins can push real
 * delivery dates later than that naive window (see `TiffinCounts.lastDeliveryDate` in
 * customer-deliveries.service.ts, which this mirrors), so an order whose deliveries have
 * shifted later still reserves through its true last delivery, not just its original
 * calendar window. Cancelled delivery rows are ignored: they will never be delivered.
 * The naive calc is only a fallback for an order with no delivery rows yet.
 */
export async function reservedEndDatesExclusive(
  tx: Tx | typeof db,
  orderWindows: OrderWindow[],
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (orderWindows.length === 0) return result;

  const orderIds = orderWindows.map((o) => o.id);
  const lastDeliveryRows = await tx
    .select({ orderId: deliveries.orderId, lastDeliveryDate: sql<string>`max(${deliveries.deliveryDate})` })
    .from(deliveries)
    .where(and(inArray(deliveries.orderId, orderIds), ne(deliveries.status, "cancelled")))
    .groupBy(deliveries.orderId);
  const lastDeliveryByOrder = new Map(lastDeliveryRows.map((r) => [r.orderId.toString(), r.lastDeliveryDate]));

  for (const o of orderWindows) {
    const naiveEnd = parseIsoDateUtc(o.startDate);
    naiveEnd.setUTCDate(naiveEnd.getUTCDate() + o.durationWeeks * 7);

    const lastDelivery = lastDeliveryByOrder.get(o.id.toString());
    if (lastDelivery) {
      const fromDelivery = parseIsoDateUtc(lastDelivery);
      fromDelivery.setUTCDate(fromDelivery.getUTCDate() + 1);
      result.set(o.id.toString(), fromDelivery > naiveEnd ? fromDelivery : naiveEnd);
    } else {
      result.set(o.id.toString(), naiveEnd);
    }
  }
  return result;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The customer's day-reserving orders with their reserved bands, minus `excludeOrderId`. */
async function reservedBands(tx: Tx | typeof db, userId: bigint, excludeOrderId?: bigint) {
  const live = await tx
    .select({ id: orders.id, startDate: orders.startDate, durationWeeks: orders.durationWeeks })
    .from(orders)
    .where(and(
      eq(orders.userId, userId),
      inArray(orders.status, [...DAY_RESERVING_STATUSES]),
      excludeOrderId == null ? undefined : ne(orders.id, excludeOrderId),
    ));
  const ends = await reservedEndDatesExclusive(tx, live);
  return live.map((o) => ({ start: parseIsoDateUtc(o.startDate), endExclusive: ends.get(o.id.toString())! }));
}

/**
 * First day a new plan may start without overlapping the customer's running plans
 * (the day after the latest reserved band), or null when nothing is running. This is
 * what the start-date pickers use as their minimum, so it must stay the same rule
 * `assertNoPlanOverlap` enforces.
 */
export async function earliestNewPlanStart(
  tx: Tx | typeof db,
  userId: bigint,
  excludeOrderId?: bigint,
): Promise<string | null> {
  const bands = await reservedBands(tx, userId, excludeOrderId);
  if (bands.length === 0) return null;
  return iso(bands.reduce((max, b) => (b.endExclusive > max ? b.endExclusive : max), bands[0]!.endExclusive));
}

/**
 * Rejects a plan window [startDate, startDate + durationWeeks*7) that overlaps any other
 * active/paused order of this customer: both would materialize deliveries on the same days.
 * `excludeOrderId` skips the order being moved/activated itself.
 */
export async function assertNoPlanOverlap(
  tx: Tx | typeof db,
  args: { userId: bigint; startDate: string; durationWeeks: number; excludeOrderId?: bigint },
): Promise<void> {
  const newStart = parseIsoDateUtc(args.startDate);
  const newEndExclusive = new Date(newStart);
  newEndExclusive.setUTCDate(newEndExclusive.getUTCDate() + args.durationWeeks * 7);
  for (const b of await reservedBands(tx, args.userId, args.excludeOrderId)) {
    if (newStart < b.endExclusive && b.start < newEndExclusive) {
      const lastDay = new Date(b.endExclusive);
      lastDay.setUTCDate(lastDay.getUTCDate() - 1);
      throw new ValidationError(
        `You already have a plan running through ${iso(lastDay)} — choose a start date on or after ${iso(b.endExclusive)}`,
      );
    }
  }
}
