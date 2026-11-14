import { HOLDS_DAY } from "@/lib/deliveries/row-state";
import { coveredDates } from "@/lib/menu/coverage";
import { ONGOING, RUNNING } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import { parseIsoDateUtc, ValidationError } from "@foundry/commons";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders } from "@/db/schema";
import type { Tx } from "@/db/client";
import { utcIso } from "@foundry/commons/util/dates";
import { assertStartNotHoliday } from "../deliveries/holiday-dates";

export type OrderWindow = { id: bigint; startDate: string; durationWeeks: number };

/**
 * Exclusive end date of the band an active/paused order reserves. Uses the true last materialized delivery
 * (pooled/rescheduled tiffins run past `startDate + durationWeeks * 7`; mirrors `TiffinCounts.lastDeliveryDate`
 * in customer-deliveries.service.ts); the naive window is only the fallback for an order with no delivery rows.
 * Rows that no longer hold their day (`HOLDS_DAY`) are ignored.
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
    .where(and(inArray(deliveries.orderId, orderIds), HOLDS_DAY))
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


async function reservedBands(tx: Tx | typeof db, userId: bigint, excludeOrderId?: bigint) {
  const live = await tx
    .select({ id: orders.id, startDate: orders.startDate, durationWeeks: orders.durationWeeks })
    .from(orders)
    .where(and(
      eq(orders.userId, userId),
      orderStatusIn(RUNNING),
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

export async function runningPlans(tx: Tx | typeof db, userId: bigint): Promise<RunningPlan[]> {
  const live = await tx
    .select({
      id: orders.id, publicId: orders.publicId, deploymentId: orders.deploymentId, status: orders.status,
      mealSize: mealSizes.name, startDate: orders.startDate, durationWeeks: orders.durationWeeks,
      tiffinCount: orders.tiffinCount, organizationId: orders.organizationId,
    })
    .from(orders)
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .where(and(eq(orders.userId, userId), orderStatusIn(RUNNING)))
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
    return { ...plan, lastDay: utcIso(lastDay), lastDelivery: lastById.get(id.toString()) ?? null };
  });
}

/** First day a new plan may start; the start-date pickers' minimum, so it must stay the same rule `assertNoPlanOverlap` enforces. */
export async function earliestNewPlanStart(
  tx: Tx | typeof db,
  userId: bigint,
  excludeOrderId?: bigint,
): Promise<string | null> {
  const bands = await reservedBands(tx, userId, excludeOrderId);
  if (bands.length === 0) return null;
  return utcIso(bands.reduce((max, b) => (b.endExclusive > max ? b.endExclusive : max), bands[0]!.endExclusive));
}

export async function lastRunningTiffinDate(tx: Tx | typeof db, userId: bigint): Promise<string | null> {
  const [row] = await tx
    .select({ last: sql<string | null>`max(${deliveries.deliveryDate})` })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(eq(orders.userId, userId), orderStatusIn(RUNNING), HOLDS_DAY));
  return row?.last ?? null;
}

export type OtherPlanDays = {
  /** Start date of the other plan that delivers on `date`, or null. */
  onTrip(date: string): string | null;
  /** True when another plan eats on `date`. */
  onEat(date: string): boolean;
};

/**
 * What the customer's other plans hold: pending, active and paused plans, only the days a live delivery row sits on
 * (`onTrip`) and the eating days those rows cover (`onEat`).
 */
export async function otherPlanDays(
  tx: Tx | typeof db,
  args: { userId: bigint; excludeOrderId?: bigint },
): Promise<OtherPlanDays> {
  const rows = await tx.select({ deliveryDate: deliveries.deliveryDate, coversDates: deliveries.coversDates, startDate: orders.startDate })
    .from(deliveries).innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(
      eq(orders.userId, args.userId),
      args.excludeOrderId == null ? undefined : ne(orders.id, args.excludeOrderId),
      orderStatusIn(ONGOING),
      inArray(deliveries.status, ["scheduled", "paused"]),
      isNull(deliveries.mergedIntoDeliveryId),
    ));
  const trips = new Map<string, string>();
  for (const r of rows) if (!trips.has(r.deliveryDate)) trips.set(r.deliveryDate, r.startDate);
  const eats = new Set(rows.flatMap(coveredDates));
  return { onTrip: (date) => trips.get(date) ?? null, onEat: (date) => eats.has(date) };
}

/** Rejects a single day another plan of this customer holds. */
export async function assertDayOutsideOtherPlans(
  tx: Tx | typeof db,
  args: { userId: bigint; date: string; excludeOrderId: bigint },
): Promise<void> {
  if ((await otherPlanDays(tx, args)).onTrip(args.date)) {
    throw new ValidationError(`This customer has another plan running on ${args.date}. Give the tiffin on that plan instead.`);
  }
}

/**
 * Rejects a plan window [startDate, startDate + durationWeeks*7) that overlaps any other
 * active/paused order of this customer: both would materialize deliveries on the same days.
 * `excludeOrderId` skips the order being moved/activated itself.
 */
async function assertNoPlanOverlap(
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
        `You already have a plan running through ${utcIso(lastDay)} — choose a start date on or after ${utcIso(b.endExclusive)}`,
      );
    }
  }
}

/** Whether a plan can occupy [startDate, startDate + durationWeeks*7): not on a declared holiday (unless already placed) and clear of the customer's other plans. Every path that starts or moves a plan runs this one check. */
export async function assertStartable(
  tx: Tx | typeof db,
  args: { userId: bigint | null; organizationId: string | null; startDate: string; durationWeeks: number; excludeOrderId?: bigint; holiday?: boolean },
): Promise<void> {
  if (args.holiday !== false) await assertStartNotHoliday(tx, args.organizationId, args.startDate);
  if (args.userId != null) await assertNoPlanOverlap(tx, { userId: args.userId, startDate: args.startDate, durationWeeks: args.durationWeeks, excludeOrderId: args.excludeOrderId });
}
