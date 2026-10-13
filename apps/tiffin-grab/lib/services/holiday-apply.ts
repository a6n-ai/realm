import { ValidationError, cutoffMsFor, parseIsoDateUtc, zonedDateIso } from "@foundry/commons";
import { and, asc, eq, inArray, isNotNull, isNull, ne, not, or, sql } from "drizzle-orm";
import { deliveries, deliveryCategorySwaps, deliveryExtraTiffins, deliveryMoves, orderActivities, orders } from "@/db/schema";
import { humanDate } from "@/lib/deliveries-view";
import { getAppSettings } from "./app-settings.service";
import { nextDeliveryDateAfter, orderDeliveryDaySet, type OptimoSyncedRow, type Tx } from "./deliveries.service";
import { upcomingHolidays, type HolidayDay } from "./holiday-dates";
import { datesInsideOtherPlans } from "./order-window";
import { MOVED_AWAY, pauseRows } from "./pause-state";

type Order = typeof orders.$inferSelect;
type Delivery = typeof deliveries.$inferSelect;
type Cutoff = { cutoffHour: number; timezone: string };

const WEEKEND = new Set(["sat", "sun"]);

export type HolidayApplied = {
  deliveryPublicId: string;
  routeSyncedAt: number | null;
  /** The closed date. */
  date: string;
  holidayId: bigint;
  holidayName: string;
  /** Dates of the ordinary deliveries added at plan end; empty when staff must place the day. */
  extraDates: string[];
  /** Why nothing was added (shown to staff); null when the extra days were added. */
  needsPlacing: string | null;
};

export type HolidayUndone = { restored: string[]; left: string[]; stops: OptimoSyncedRow[] };

/** Trucks never run on weekends; a trial delivers on its own send days. */
async function planWeekdays(tx: Tx, order: Order): Promise<Set<string>> {
  const pattern = order.trialLength != null ? new Set<string>(order.trialWeekdays ?? []) : await orderDeliveryDaySet(tx, order);
  return new Set([...pattern].filter((d) => !WEEKEND.has(d)));
}

/**
 * The next `n` free plan weekdays strictly after `after`: no row of this order on the date (a
 * cancelled, held or paused row keeps its date), not a holiday, cutoff still ahead. Null when the
 * plan's weekdays cannot supply them.
 */
async function freePlanDays(tx: Tx, order: Order, after: string, n: number, holidays: ReadonlyMap<string, HolidayDay>, cut: Cutoff): Promise<string[] | null> {
  const weekdays = await planWeekdays(tx, order);
  if (weekdays.size === 0) return null;
  const taken = new Set((await tx.select({ date: deliveries.deliveryDate }).from(deliveries).where(eq(deliveries.orderId, order.id))).map((r) => r.date));
  const now = Date.now();
  const out: string[] = [];
  let cursor = after;
  for (let guard = 0; guard < 120 && out.length < n; guard++) {
    cursor = nextDeliveryDateAfter(cursor, weekdays);
    if (taken.has(cursor) || holidays.has(cursor)) continue;
    if (cutoffMsFor(cursor, cut.cutoffHour, cut.timezone) <= now) continue;
    out.push(cursor);
  }
  return out.length === n ? out : null;
}

/** Ordinary scheduled deliveries, one eating day each, standing in for `sourceId`. Never make-ups. */
async function insertExtras(tx: Tx, order: Order, sourceId: bigint, dates: string[], cut: Cutoff): Promise<void> {
  await tx.insert(deliveries).values(dates.map((date) => ({
    orderId: order.id,
    deliveryDate: date,
    status: "scheduled" as const,
    cutoffAt: cutoffMsFor(date, cut.cutoffHour, cut.timezone),
    tiffinUnits: Math.max(1, order.persons),
    coversDates: [date],
    holidayExtraForDeliveryId: sourceId,
    organizationId: order.organizationId,
  })));
}

/**
 * Closes every scheduled, not-yet-delivered delivery of this order that sits on a holiday of its
 * organization (today or later): the row is paused and tagged, no pause budget is charged, and
 * one ordinary delivery per eating day is added after the plan's last delivery. A trial, a plan
 * whose next days belong to the customer's next plan, and a plan with no free day are closed too
 * but left for staff to place. Idempotent: a closed row is no longer scheduled. Caller owns the tx
 * and holds the order's advisory lock.
 */
export async function applyHolidaysToOrder(tx: Tx, order: Order, actorId: bigint | null): Promise<HolidayApplied[]> {
  if (!order.organizationId || order.status === "cancelled" || order.status === "completed") return [];
  const cut = await getAppSettings();
  const now = Date.now();
  const holidays = await upcomingHolidays(tx, order.organizationId, zonedDateIso(now, cut.timezone));
  if (holidays.size === 0) return [];

  const hit = await tx.select().from(deliveries).where(and(
    eq(deliveries.orderId, order.id),
    eq(deliveries.status, "scheduled"),
    isNull(deliveries.mergedIntoDeliveryId),
    isNull(deliveries.holidayId),
    inArray(deliveries.deliveryDate, [...holidays.keys()]),
    sql`${deliveries.optimoCompletionStatus} is distinct from 'success'`,
  )).orderBy(asc(deliveries.deliveryDate));

  const per = Math.max(1, order.persons);
  const applied: HolidayApplied[] = [];
  for (const row of hit) {
    const holiday = holidays.get(row.deliveryDate)!;
    const [paused] = await pauseRows(tx, [row.id], now, holiday.id);
    if (!paused) continue;

    let extraDates: string[] = [];
    let needsPlacing: string | null = null;
    if (row.tiffinUnits === 0) {
      // An emptied carrier: it holds no tiffin to add back.
    } else if (order.trialLength != null) {
      needsPlacing = "trial";
    } else if (row.tiffinUnits % per !== 0) {
      needsPlacing = "tiffin count does not divide by persons";
    } else {
      const [{ tail }] = await tx.select({ tail: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries)
        .where(and(eq(deliveries.orderId, order.id), ne(deliveries.status, "cancelled")));
      const dates = await freePlanDays(tx, order, tail, row.tiffinUnits / per, holidays, cut);
      const clash = dates && order.userId != null ? await datesInsideOtherPlans(tx, { userId: order.userId, dates, excludeOrderId: order.id }) : [];
      if (!dates) needsPlacing = "no free delivery day found";
      else if (clash.length > 0) needsPlacing = `another plan runs on ${humanDate(clash[0]!)}`;
      else {
        await insertExtras(tx, order, row.id, dates, cut);
        extraDates = dates;
      }
    }

    await tx.insert(orderActivities).values({
      orderId: order.id, deliveryId: row.id, type: "note", createdBy: actorId, organizationId: order.organizationId,
      note: needsPlacing
        ? `Holiday (${holiday.name}): ${row.deliveryDate} closed. Extra day needs placing: ${needsPlacing}`
        : `Holiday (${holiday.name}): ${row.deliveryDate} closed${extraDates.length ? `, added ${extraDates.join(", ")}` : ""}`,
    });
    applied.push({ deliveryPublicId: row.publicId, routeSyncedAt: row.routeSyncedAt, date: row.deliveryDate, holidayId: holiday.id, holidayName: holiday.name, extraDates, needsPlacing });
  }
  return applied;
}

/** Every per-delivery address / drop-off override on a delivery row; any of them set means the customer or staff changed this day. */
const ADDRESS_OVERRIDES = ["addressId", "fullName", "addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions", "deliveryStrategyId", "deliveryTagId", "addressTagId", "zoneId"] as const;

const isRealDate = (iso: string): boolean => {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

/** An added day is "as the holiday left it" only while nothing about it changed: any doubt keeps it. */
async function extrasUntouched(tx: Tx, extras: Delivery[], per: number, now: number): Promise<boolean> {
  if (extras.length === 0) return true;
  const plain = extras.every((e) => e.status === "scheduled" && e.mergedIntoDeliveryId == null && e.cutoffAt > now && e.optimoCompletionStatus == null
    && e.tiffinUnits === per && e.coversDates?.length === 1 && e.coversDates[0] === e.deliveryDate && ADDRESS_OVERRIDES.every((col) => e[col] == null) && e.deliveryStrategyIds.length === 0);
  if (!plain) return false;
  const ids = extras.map((e) => e.id);
  const touched = await Promise.all([
    tx.select({ id: deliveryMoves.id }).from(deliveryMoves).where(or(inArray(deliveryMoves.fromDeliveryId, ids), inArray(deliveryMoves.toDeliveryId, ids))).limit(1),
    tx.select({ id: deliveryCategorySwaps.id }).from(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.deliveryId, ids)).limit(1),
    tx.select({ id: deliveryExtraTiffins.id }).from(deliveryExtraTiffins).where(inArray(deliveryExtraTiffins.deliveryId, ids)).limit(1),
  ]);
  return touched.every((r) => r.length === 0);
}

/**
 * Reverses one holiday for one order. A closed day goes back on the schedule only when its own
 * cutoff is ahead and its added days are exactly as the holiday left them (they are then
 * deleted). Otherwise the added days stay, the customer keeps the same number of tiffins, and the
 * closed row becomes an ordinary held row: settled by its added days when it has them, movable
 * when it has none. A row closed some other way (a hold tagged after the fact) only loses the label.
 */
export async function undoHolidayForOrder(tx: Tx, orderId: bigint, holidayId: bigint, actorId: bigint | null): Promise<HolidayUndone> {
  const [order] = await tx.select({ persons: orders.persons, organizationId: orders.organizationId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  const per = Math.max(1, order?.persons ?? 1);
  const sources = await tx.select().from(deliveries)
    .where(and(eq(deliveries.orderId, orderId), eq(deliveries.holidayId, holidayId))).orderBy(asc(deliveries.deliveryDate));
  const now = Date.now();
  const out: HolidayUndone = { restored: [], left: [], stops: [] };

  for (const source of sources) {
    if (source.status !== "paused") {
      await tx.update(deliveries).set({ holidayId: null }).where(eq(deliveries.id, source.id));
      if (source.status !== "cancelled") out.left.push(source.deliveryDate);
      continue;
    }
    const extras = await tx.select().from(deliveries).where(eq(deliveries.holidayExtraForDeliveryId, source.id));
    const whole = extras.length === 0 || extras.reduce((n, e) => n + e.tiffinUnits, 0) === source.tiffinUnits;
    if (source.cutoffAt > now && whole && (await extrasUntouched(tx, extras, per, now))) {
      if (extras.length > 0) await tx.delete(deliveries).where(inArray(deliveries.id, extras.map((e) => e.id)));
      await tx.update(deliveries).set({ status: "scheduled", holidayId: null }).where(eq(deliveries.id, source.id));
      await tx.insert(orderActivities).values({
        orderId, deliveryId: source.id, type: "note", createdBy: actorId, organizationId: order?.organizationId ?? null,
        note: `Holiday removed: ${source.deliveryDate} is back on`,
      });
      out.restored.push(source.deliveryDate);
      out.stops.push(...extras.map((e) => ({ publicId: e.publicId, routeSyncedAt: e.routeSyncedAt })));
    } else {
      await tx.update(deliveries).set({ status: "skipped", holidayId: null }).where(eq(deliveries.id, source.id));
      await tx.insert(orderActivities).values({
        orderId, deliveryId: source.id, type: "note", createdBy: actorId, organizationId: order?.organizationId ?? null,
        note: extras.length > 0 ? `Holiday removed: ${source.deliveryDate} keeps its added day (${extras.map((e) => e.deliveryDate).sort().join(", ")})` : `Holiday removed: ${source.deliveryDate} stays on hold`,
      });
      out.left.push(source.deliveryDate);
    }
  }
  return out;
}

/**
 * Staff place the day(s) of a closed row the system could not place itself, on the first free
 * plan weekdays on or after `fromDate`. No other-plan check: staff chose the date knowing the
 * customer's plans. Only a paused holiday row qualifies; a held row is moved from the order page.
 */
export async function placeHolidayExtras(tx: Tx, order: Order, sourceId: bigint, fromDate: string, actorId: bigint | null): Promise<string[]> {
  const cut = await getAppSettings();
  const today = zonedDateIso(Date.now(), cut.timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !isRealDate(fromDate)) throw new ValidationError("Pick a valid date");
  if (fromDate < today) throw new ValidationError("Pick today or a later date");
  if (order.status !== "active" && order.status !== "paused") throw new ValidationError(`Cannot add a delivery to an order that is ${order.status}`);
  const [source] = await tx.select().from(deliveries).where(and(
    eq(deliveries.id, sourceId),
    eq(deliveries.orderId, order.id),
    isNotNull(deliveries.holidayId),
    eq(deliveries.status, "paused"),
    not(MOVED_AWAY),
  )).limit(1);
  if (!source || source.tiffinUnits === 0) throw new ValidationError("Nothing to place: this day already has its extra day, or it is on hold and is moved from the order page");
  const per = Math.max(1, order.persons);
  if (source.tiffinUnits % per !== 0) throw new ValidationError("This trip's tiffin count does not divide by persons, so it cannot be placed automatically");

  const dayBefore = parseIsoDateUtc(fromDate);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const holidays = await upcomingHolidays(tx, order.organizationId, today);
  const dates = await freePlanDays(tx, order, dayBefore.toISOString().slice(0, 10), source.tiffinUnits / per, holidays, cut);
  if (!dates) throw new ValidationError("No free delivery day found from that date");

  await insertExtras(tx, order, source.id, dates, cut);
  await tx.insert(orderActivities).values({
    orderId: order.id, deliveryId: source.id, type: "note", createdBy: actorId, organizationId: order.organizationId,
    note: `Holiday day ${source.deliveryDate} placed on ${dates.join(", ")}`,
  });
  return dates;
}
