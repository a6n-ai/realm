import { NotFoundError, cutoffMsFor, parseIsoDateUtc, weekdayKey, zonedDateIso } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, eq, inArray, isNull, ne, not } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders } from "@/db/schema";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import { coveredDates, dateCounts } from "@/lib/menu/coverage";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { loadExtraDates } from "./delivery-extras";
import { getAppSettings } from "./app-settings.service";
import { holidayForOrderDate } from "./holiday-dates";
import { orderDeliveryDaySet, rescheduleDelivery, type Tx } from "./deliveries.service";
import { MOVED_AWAY, isLapsedPause, lapsedPauseDates, type Reader } from "./pause-state";

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
  const d = parseIsoDateUtc(tail);
  for (let guard = 0; guard < 400; guard++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!eatingDays.has(weekdayKey(d))) continue;
    const eat = d.toISOString().slice(0, 10);
    const trip = tripFor(eat);
    if (trip && isOpen(trip) && !(await isBlocked(eat, trip))) return eat;
  }
  return null;
}

/** Eating days covered by these rows (covers_dates, or the row's own date on a legacy row). */
const eatDates = (rows: { deliveryDate: string; coversDates: string[] | null }[]) => rows.flatMap(coveredDates);

async function endOfPlanDate(orderId: bigint): Promise<string | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const { timezone, cutoffHour } = await getAppSettings();
  const now = Date.now();
  const today = zonedDateIso(now, timezone);
  const deliveryDays = await orderDeliveryDaySet(db as unknown as Tx, order);
  // A legacy plan without eating_days eats on its delivery days (weekend add-ons included).
  const eating = new Set<string>(order.eatingDays?.length ? order.eatingDays : deliveryDays);
  // Weekend food rides Friday: a trip is always a weekday.
  const trips = [...deliveryDays].filter((d) => d !== "sat" && d !== "sun") as DayOfWeek[];
  const live = and(inArray(deliveries.status, ["scheduled", "paused"]), isNull(deliveries.mergedIntoDeliveryId));
  const own = eatDates(await db.select({ deliveryDate: deliveries.deliveryDate, coversDates: deliveries.coversDates })
    .from(deliveries).where(and(eq(deliveries.orderId, orderId), live)));
  const last = own.reduce((m, d) => (d > m ? d : m), today);
  const others = order.userId == null ? [] : await db.select({ deliveryDate: deliveries.deliveryDate, coversDates: deliveries.coversDates })
    .from(deliveries).innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(eq(orders.userId, order.userId), ne(orders.id, orderId), inArray(orders.status, ["pending", "active", "paused"]), live));
  const takenTrips = new Set(others.map((r) => r.deliveryDate));
  const takenEats = new Set(eatDates(others));
  return nextEndOfPlanDate(
    last,
    eating,
    (eat) => carryTripDateIso(eat, trips),
    (trip) => trip >= today && cutoffMsFor(trip, cutoffHour, timezone) > now,
    async (eat, trip) => takenTrips.has(trip) || takenEats.has(eat)
      || (await holidayForOrderDate(db, orderId, trip)) != null || (await holidayForOrderDate(db, orderId, eat)) != null,
  );
}

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
            const { carriedOn } = await rescheduleDelivery(row.publicId, target, null, eat);
            const rides = carriedOn === target ? "" : ` (rides ${carriedOn})`;
            await db.insert(orderActivities).values({ orderId, deliveryId: row.id, type: "note", note: `Paused ${eat} moved to ${target}${rides}, the end of the plan` });
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

/** Flip the switch; turning it on also moves any paused day already past its cutoff. The activity says who flipped it. */
export async function setAutoMovePaused(orderPublicId: string, on: boolean, actorId: bigint | null): Promise<{ on: boolean; moved: number }> {
  const [order] = await db.update(orders).set({ autoMovePaused: on }).where(eq(orders.publicId, orderPublicId))
    .returning({ id: orders.id, organizationId: orders.organizationId });
  if (!order) throw new NotFoundError("Subscription not found");
  await db.insert(orderActivities).values({ orderId: order.id, type: "note", note: `Paused days go to the end of the plan: ${on ? "on" : "off"}`, createdBy: actorId, organizationId: order.organizationId });
  return { on, moved: on ? await moveLapsedPausesToEnd(order.id) : 0 };
}
