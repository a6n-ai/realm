import { NotFoundError, cutoffMsFor, parseIsoDateUtc, weekdayKey, zonedDateIso } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { and, asc, eq, inArray, isNull, ne, not, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders } from "@/db/schema";
import { dateCounts } from "@/lib/menu/coverage";
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
 * First plan weekday after `tail` that is still ahead of its cutoff and not blocked (a holiday,
 * or a day another live plan of the customer already delivers on). A renewal that starts right
 * after the plan leaves no gap, so the day lands after the renewal's last delivery.
 */
export async function nextEndOfPlanDate(
  tail: string,
  weekdays: ReadonlySet<string>,
  isOpen: (date: string) => boolean,
  isBlocked: (date: string) => Promise<boolean>,
): Promise<string | null> {
  const d = parseIsoDateUtc(tail);
  for (let guard = 0; guard < 400; guard++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (weekdays.has(weekdayKey(d)) && isOpen(iso) && !(await isBlocked(iso))) return iso;
  }
  return null;
}

async function endOfPlanDate(orderId: bigint): Promise<string | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const { timezone, cutoffHour } = await getAppSettings();
  const now = Date.now();
  const today = zonedDateIso(now, timezone);
  // Weekend food rides Friday: a moved tiffin always lands on a trip weekday.
  const weekdays = new Set([...(await orderDeliveryDaySet(db as unknown as Tx, order))].filter((d) => d !== "sat" && d !== "sun"));
  const [{ max }] = await db.select({ max: sql<string | null>`max(${deliveries.deliveryDate})` }).from(deliveries)
    .where(and(eq(deliveries.orderId, orderId), inArray(deliveries.status, ["scheduled", "paused"]), isNull(deliveries.mergedIntoDeliveryId)));
  const tail = max && max > today ? max : today;
  const taken = order.userId == null ? new Set<string>() : new Set((await db.select({ date: deliveries.deliveryDate }).from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(
      eq(orders.userId, order.userId), ne(orders.id, orderId), inArray(orders.status, ["pending", "active", "paused"]),
      inArray(deliveries.status, ["scheduled", "paused"]), isNull(deliveries.mergedIntoDeliveryId), sql`${deliveries.deliveryDate} > ${tail}`,
    ))).map((r) => r.date));
  return nextEndOfPlanDate(
    tail,
    weekdays,
    (d) => cutoffMsFor(d, cutoffHour, timezone) > now,
    async (d) => taken.has(d) || (await holidayForOrderDate(db, orderId, d)) != null,
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
      eq(deliveries.orderId, orderId), eq(deliveries.status, "skipped"), isNull(deliveries.holidayId),
      isNull(deliveries.makeupForDeliveryId), not(MOVED_AWAY),
    )).orderBy(asc(deliveries.deliveryDate));
    const lapsed = (await lapsedPauseDates(db, [orderId])).get(orderId);
    const held = rows.filter((r) => isLapsedPause(r, lapsed));
    if (held.length === 0) return 0;
    const extras = await loadExtraDates(db, held.map((r) => r.id));
    for (const row of held) {
      for (const [eat, n] of dateCounts(row, extras.get(row.id) ?? [])) {
        for (let i = 0; i < n; i++) {
          const target = await endOfPlanDate(orderId);
          if (!target) return moved;
          await rescheduleDelivery(row.publicId, target, null, eat);
          await db.insert(orderActivities).values({ orderId, deliveryId: row.id, type: "note", note: `Paused ${eat} moved to ${target}, the end of the plan` });
          moved++;
        }
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
