import { parseIsoDateUtc, ValidationError } from "@foundry/commons";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders } from "@/db/schema";
import type { Tx } from "./deliveries.service";

export type OrderWindow = { id: bigint; startDate: string; durationWeeks: number };

/**
 * Order statuses that hold real calendar days. Cancelled, completed, waitlisted and
 * pending orders deliver nothing, so they never block another plan's start date.
 */
export const DAY_RESERVING_STATUSES = ["active", "paused"] as const;

/**
 * A delivery row still holds its date: not cancelled, and its tiffin was not handed to
 * another row (merged, made up, or given a holiday's extra day). A skipped day made up
 * earlier must not stretch the plan past its real last tiffin.
 */
export const holdsDay = sql`(${deliveries.status} <> 'cancelled' and ${deliveries.mergedIntoDeliveryId} is null and not exists (
  select 1 from deliveries c where c.makeup_for_delivery_id = ${deliveries.id} or c.holiday_extra_for_delivery_id = ${deliveries.id}))`;

/**
 * The calendar band an active/paused order actually reserves, keyed by order id, as an
 * exclusive end date (the first day NOT reserved).
 *
 * Prefers the true last materialized delivery date over the naive
 * `startDate + durationWeeks * 7` calculation: pooled/rescheduled tiffins can push real
 * delivery dates later than that naive window (see `TiffinCounts.lastDeliveryDate` in
 * customer-deliveries.service.ts, which this mirrors), so an order whose deliveries have
 * shifted later still reserves through its true last delivery, not just its original
 * calendar window. Rows that no longer hold their day (`holdsDay`) are ignored.
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
    .where(and(inArray(deliveries.orderId, orderIds), holdsDay))
    .groupBy(deliveries.orderId);
  const lastDeliveryByOrder = new Map(lastDeliveryRows.map((r) => [r.orderId.toString(), r.lastDeliveryDate]));

  for (const o of orderWindows) {
    const naiveEnd = parseIsoDateUtc(o.startDate);
    naiveEnd.setUTCDate(naiveEnd.getUTCDate() + o.durationWeeks * 7);

    const lastDelivery = lastDeliveryByOrder.get(o.id.toString());
    if (lastDelivery) {
      // The rows are the plan: one trimmed short (balance corrections) frees its days, and
      // the next plan may start the day after its last tiffin.
      const fromDelivery = parseIsoDateUtc(lastDelivery);
      fromDelivery.setUTCDate(fromDelivery.getUTCDate() + 1);
      result.set(o.id.toString(), fromDelivery);
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

export type RunningPlan = {
  publicId: string;
  deploymentId: string;
  status: string;
  mealSize: string;
  startDate: string;
  /** Last day this plan holds: what a new plan must start after. */
  lastDay: string;
  /** Its last actual delivery, which can be earlier than lastDay (a short plan still holds whole weeks). */
  lastDelivery: string | null;
  tiffinCount: number;
  organizationId: string | null;
};

/** The customer's day-reserving plans, earliest first, as the staff order form lists them. */
export async function runningPlans(tx: Tx | typeof db, userId: bigint): Promise<RunningPlan[]> {
  const live = await tx
    .select({
      id: orders.id, publicId: orders.publicId, deploymentId: orders.deploymentId, status: orders.status,
      mealSize: mealSizes.name, startDate: orders.startDate, durationWeeks: orders.durationWeeks,
      tiffinCount: orders.tiffinCount, organizationId: orders.organizationId,
    })
    .from(orders)
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .where(and(eq(orders.userId, userId), inArray(orders.status, [...DAY_RESERVING_STATUSES])))
    .orderBy(orders.startDate);
  const ends = await reservedEndDatesExclusive(tx, live);
  const lasts = live.length === 0 ? [] : await tx
    .select({ orderId: deliveries.orderId, last: sql<string>`max(${deliveries.deliveryDate})` })
    .from(deliveries)
    .where(and(inArray(deliveries.orderId, live.map((o) => o.id)), eq(deliveries.status, "scheduled")))
    .groupBy(deliveries.orderId);
  const lastById = new Map(lasts.map((r) => [r.orderId.toString(), r.last]));
  return live.map(({ id, durationWeeks: _weeks, ...plan }) => {
    const lastDay = new Date(ends.get(id.toString())!);
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    return { ...plan, lastDay: iso(lastDay), lastDelivery: lastById.get(id.toString()) ?? null };
  });
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

/** The last tiffin date across the customer's running (active/paused) plans, or null when none is scheduled. */
export async function lastRunningTiffinDate(tx: Tx | typeof db, userId: bigint): Promise<string | null> {
  const [row] = await tx
    .select({ last: sql<string | null>`max(${deliveries.deliveryDate})` })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(eq(orders.userId, userId), inArray(orders.status, [...DAY_RESERVING_STATUSES]), holdsDay));
  return row?.last ?? null;
}

/** Rejects a single day that falls inside another active/paused plan of this customer. */
export async function assertDayOutsideOtherPlans(
  tx: Tx | typeof db,
  args: { userId: bigint; date: string; excludeOrderId: bigint },
): Promise<void> {
  const day = parseIsoDateUtc(args.date);
  for (const b of await reservedBands(tx, args.userId, args.excludeOrderId)) {
    if (b.start <= day && day < b.endExclusive) {
      throw new ValidationError(`This customer has another plan running on ${args.date}. Give the tiffin on that plan instead.`);
    }
  }
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

/** The given days that fall inside another active/paused plan of this customer (same band rule as assertDayOutsideOtherPlans). */
export async function datesInsideOtherPlans(
  tx: Tx | typeof db,
  args: { userId: bigint; dates: string[]; excludeOrderId: bigint },
): Promise<string[]> {
  const bands = await reservedBands(tx, args.userId, args.excludeOrderId);
  return args.dates.filter((date) => {
    const day = parseIsoDateUtc(date);
    return bands.some((b) => b.start <= day && day < b.endExclusive);
  });
}
