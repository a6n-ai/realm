import { MOVED_AWAY } from "@/lib/deliveries/row-state";
import { isCutoffPassed } from "@/lib/dates/cutoff";
import { NotFoundError, cutoffMsFor, zonedDateIso } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, eq, inArray, isNull, not } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders } from "@/db/schema";
import { nextOpenPlanDay } from "@/lib/deliveries/next-open-day";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import { coveredDates, dateCounts } from "@/lib/menu/coverage";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { loadExtraDates } from "./delivery-extras";
import { getAppSettings } from "../services/app-settings.service";
import { holidayForOrderDate } from "./holiday-dates";
import { loadPlanDays, rescheduleDelivery } from "./deliveries.service";
import { otherPlanDays } from "../orders/order-window";
import { isLapsedPause, lapsedPauseDates, type Reader } from "./pause-state";

const log = createLogger("pause-auto-move");

export async function autoMovePausedOn(exec: Reader, orderId: bigint): Promise<boolean> {
  const [row] = await exec.select({ on: orders.autoMovePaused }).from(orders).where(eq(orders.id, orderId)).limit(1);
  return row?.on ?? false;
}

/**
 * First plan eating day after `tail` (the last day the plan already eats) whose carrying trip is
 * still ahead of its cutoff and not blocked (a holiday, or a day another live plan of the customer
 * already has). Days follow the plan's own eating pattern, one tiffin per day, and each rides the
 * trip that normally carries it, so a three-trip week stays three trips. A renewal that starts right
 * after the plan leaves no gap, so the day lands after the renewal ends.
 */
export async function nextEndOfPlanDate(
  tail: string,
  eatingDays: ReadonlySet<string>,
  tripFor: (eat: string) => string | null,
  isOpen: (trip: string) => boolean,
  isBlocked: (eat: string, trip: string) => Promise<boolean>,
): Promise<string | null> {
  return nextOpenPlanDay(tail, {
    days: eatingDays,
    maxCalendarDays: 400,
    skip: async (eat) => {
      const trip = tripFor(eat);
      return !trip || !isOpen(trip) || (await isBlocked(eat, trip));
    },
  });
}

/** Eating days covered by these rows (covers_dates, or the row's own date on a legacy row). */
const eatDates = (rows: { deliveryDate: string; coversDates: string[] | null }[]) => rows.flatMap(coveredDates);

async function endOfPlanDate(orderId: bigint): Promise<string | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const { timezone, cutoffHour } = await getAppSettings();
  const now = Date.now();
  const today = zonedDateIso(now, timezone);
  const deliveryDays = await loadPlanDays(db, order);
  // A legacy plan without eating_days eats on its delivery days (weekend add-ons included).
  const eating = new Set<string>(order.eatingDays?.length ? order.eatingDays : deliveryDays);
  // Weekend food rides Friday: a trip is always a weekday.
  const trips = [...(await loadPlanDays(db, order, { weekdaysOnly: true }))] as DayOfWeek[];
  const live = and(inArray(deliveries.status, ["scheduled", "paused"]), isNull(deliveries.mergedIntoDeliveryId));
  const own = eatDates(await db.select({ deliveryDate: deliveries.deliveryDate, coversDates: deliveries.coversDates })
    .from(deliveries).where(and(eq(deliveries.orderId, orderId), live)));
  const last = own.reduce((m, d) => (d > m ? d : m), today);
  const others = order.userId == null ? null : await otherPlanDays(db, { userId: order.userId, excludeOrderId: orderId });
  return nextEndOfPlanDate(
    last,
    eating,
    (eat) => carryTripDateIso(eat, trips),
    (trip) => trip >= today && !isCutoffPassed(cutoffMsFor(trip, cutoffHour, timezone), now),
    async (eat, trip) => others?.onTrip(trip) != null || others?.onEat(eat) === true
      || (await holidayForOrderDate(db, orderId, trip)) != null || (await holidayForOrderDate(db, orderId, eat)) != null,
  );
}

const movedToEndNote = (eat: string, target: string, carriedOn: string) =>
  `Paused ${eat} moved to ${target}${carriedOn === target ? "" : ` (rides ${carriedOn})`}, the end of the plan`;

/**
 * With the switch on, every paused day that reached its cutoff (a lapsed pause, still holding its
 * tiffin) moves to the end of the plan, one tiffin at a time, through the same reschedule the
 * customer's Move uses. A day that cannot move stays a hold, which Move still offers. Never throws.
 */
export async function moveLapsedPausesToEnd(orderId: bigint): Promise<number> {
  let moved = 0;
  try {
    const rows = await db.select().from(deliveries).where(and(
      eq(deliveries.orderId, orderId), eq(deliveries.status, "skipped"), isNull(deliveries.holidayId), not(MOVED_AWAY),
    )).orderBy(asc(deliveries.deliveryDate));
    const lapsed = (await lapsedPauseDates(db, [orderId])).get(orderId);
    const held = rows.filter((r) => isLapsedPause(r, lapsed));
    if (held.length === 0) return 0;
    const extras = await loadExtraDates(db, held.map((r) => r.id));
    for (const row of held) {
      try {
        // Two tiffins on one day go to two eating days.
        for (const [eat, n] of dateCounts(row, extras.get(row.id) ?? [])) {
          for (let i = 0; i < n; i++) {
            const target = await endOfPlanDate(orderId);
            if (!target) return moved;
            await rescheduleDelivery(row.publicId, target, null, eat, 1, (carriedOn) => movedToEndNote(eat, target, carriedOn));
            moved++;
          }
        }
      } catch (err) {
        // This day stays a hold the customer can Move; the rest still go.
        log.error({ err, orderId: String(orderId), deliveryId: String(row.id) }, "move lapsed pause to end failed");
      }
    }
  } catch (err) {
    log.error({ err, orderId: String(orderId) }, "move lapsed pauses to end failed");
  }
  return moved;
}

/**
 * Some eating days of a trip paused while the rest of the truck still goes out (Sat off a
 * Fri + Sat + Sun trip): each of those tiffins goes to the end of the plan now, where a whole
 * paused day ends up at its cutoff. One reschedule per tiffin, each in its own transaction, so
 * one that cannot move stays on the trip and comes back in `failed`.
 */
export async function movePausedTiffinsToEnd(
  orderId: bigint,
  tiffins: { deliveryPublicId: string; eat: string }[],
  actorId: bigint | null,
): Promise<{ moved: string[]; failed: string[] }> {
  const moved: string[] = [];
  const failed: string[] = [];
  for (const t of tiffins) {
    try {
      const target = await endOfPlanDate(orderId);
      if (!target) throw new Error("no end-of-plan day");
      await rescheduleDelivery(t.deliveryPublicId, target, actorId, t.eat, 1, (carriedOn) => movedToEndNote(t.eat, target, carriedOn));
      moved.push(t.eat);
    } catch (err) {
      log.error({ err, orderId: String(orderId), eat: t.eat }, "move paused tiffin to end failed");
      failed.push(t.eat);
    }
  }
  return { moved, failed };
}

/** Flip the switch; turning it on also moves any paused day already past its cutoff. The activity says who flipped it. */
export async function setAutoMovePaused(orderPublicId: string, on: boolean, actorId: bigint | null): Promise<{ on: boolean; moved: number }> {
  const [order] = await db.update(orders).set({ autoMovePaused: on }).where(eq(orders.publicId, orderPublicId))
    .returning({ id: orders.id, organizationId: orders.organizationId });
  if (!order) throw new NotFoundError("Subscription not found");
  await db.insert(orderActivities).values({ orderId: order.id, type: "note", note: `Paused days go to the end of the plan: ${on ? "on" : "off"}`, createdBy: actorId, organizationId: order.organizationId });
  return { on, moved: on ? await moveLapsedPausesToEnd(order.id) : 0 };
}
