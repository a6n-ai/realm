import { NotFoundError, ValidationError, zonedDateIso } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, gt, gte, inArray, isNull, like, not, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, holidays, orders, organization, users } from "@/db/schema";
import { humanDate } from "@/lib/deliveries-view";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { notificationTables } from "@/lib/notifications/tables";
import { publishAnalyticsLive } from "@/lib/realtime/publish-inbox";
import { getAppSettings } from "./app-settings.service";
import { deleteFromOptimoRouteBestEffort, type OptimoSyncedRow, type Tx } from "./deliveries.service";
import { applyHolidaysToOrder, placeHolidayExtras, undoHolidayForOrder, type HolidayApplied, type HolidayUndone } from "./holiday-apply";
import { removeStopsBestEffort } from "./pause-days.service";
import { MOVED_AWAY } from "./pause-state";

const log = createLogger("holidays.service");
const sources = alias(deliveries, "holiday_sources");
const NAME_MAX = 60;

type Visible = "all" | string[];
type Holiday = typeof holidays.$inferSelect;
type Order = typeof orders.$inferSelect;

export type HolidayPreview = { affected: number; onRoute: number; delivered: number };
export type HolidayRun = { closed: number; needsPlacing: number; failed: string[]; removedFromRoute: number };
export type HolidayRow = { publicId: string; date: string; name: string; organizationId: string; organizationName: string; closed: number; declaredBy: string | null; createdAt: number };
export type NeedsPlacingRow = {
  deliveryPublicId: string; date: string; holidayPublicId: string; holidayName: string;
  orderPublicId: string; orderCode: string; customerName: string; tiffins: number;
  /** A trial: never auto-placed. */
  trial: boolean;
  /** A hold tagged after the fact: staff move it from the order page, not from here. */
  held: boolean;
};

function cleanName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new ValidationError("Give the holiday a name");
  if (name.length > NAME_MAX) throw new ValidationError(`Keep the name under ${NAME_MAX} characters`);
  // The name goes into customer emails unescaped, so markup is refused rather than escaped (the app renders it via React).
  if (/[<>]/.test(name)) throw new ValidationError("Holiday names cannot contain < or >");
  return name;
}

function assertRealDate(date: string): void {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ValidationError("Pick a date");
  }
}

async function assertOrgVisible(organizationId: string, visible: Visible): Promise<void> {
  if (visible !== "all" && !visible.includes(organizationId)) throw new NotFoundError("Organization not found");
  // "all" still has to name a real organization: same error as one the caller cannot see, not a foreign-key failure.
  const [found] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).limit(1);
  if (!found) throw new NotFoundError("Organization not found");
}

const scope = (visible: Visible) => (visible === "all" ? undefined : inArray(holidays.organizationId, visible));
const sees = (visible: Visible) => visible === "all" || visible.length > 0;

async function today(): Promise<string> {
  return zonedDateIso(Date.now(), (await getAppSettings()).timezone);
}

async function scopedHoliday(publicId: string, visible: Visible): Promise<Holiday> {
  if (!sees(visible)) throw new NotFoundError("Holiday not found");
  const [holiday] = await db.select().from(holidays).where(and(eq(holidays.publicId, publicId), scope(visible))).limit(1);
  if (!holiday) throw new NotFoundError("Holiday not found");
  return holiday;
}

/** Scheduled trips on that date for that organization, split by how far along they are. */
export async function previewHoliday(input: { organizationId: string; date: string }, visible: Visible): Promise<HolidayPreview> {
  await assertOrgVisible(input.organizationId, visible);
  const rows = await db.select({ routeSyncedAt: deliveries.routeSyncedAt, completion: deliveries.optimoCompletionStatus })
    .from(deliveries).innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(
      eq(orders.organizationId, input.organizationId), inArray(orders.status, ["active", "paused", "pending"]),
      eq(deliveries.deliveryDate, input.date), eq(deliveries.status, "scheduled"), isNull(deliveries.mergedIntoDeliveryId),
    ));
  const live = rows.filter((r) => r.completion !== "success");
  return { affected: live.length, onRoute: live.filter((r) => r.routeSyncedAt != null).length, delivered: rows.length - live.length };
}

async function announceDeclared(tx: Tx, order: Order, holiday: Holiday, own: HolidayApplied[]): Promise<void> {
  const added = own.flatMap((a) => a.extraDates);
  const waiting = own.some((a) => a.needsPlacing != null);
  // An emptied carrier holds no tiffin: there is nothing to tell the customer.
  if (added.length === 0 && !waiting) return;
  const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, order.userId!)).limit(1);
  const date = humanDate(holiday.date);
  let movedTo = "Our team will place it";
  let lastDate = "";
  let outcome = `Our kitchen is closed on ${date}. Our team will place that tiffin on a new day.`;
  if (!waiting) {
    const [{ last }] = await tx.select({ last: sql<string | null>`max(${deliveries.deliveryDate})` }).from(deliveries)
      .where(and(eq(deliveries.orderId, order.id), eq(deliveries.status, "scheduled")));
    movedTo = added.map(humanDate).join(", ");
    lastDate = last ? humanDate(last) : movedTo;
    outcome = `Your tiffin for that day is added back at the end of your plan (${movedTo}). Your plan now ends ${lastDate}.`;
  }
  await enqueueNotification(tx, {
    event: "holiday_declared",
    recipientId: order.userId!,
    title: `Closed on ${date}: ${holiday.name}`,
    body: outcome,
    href: "/me/deliveries",
    data: { order: { code: order.deploymentId, customerName: user?.name ?? "", holidayName: holiday.name, date, movedTo, lastDate, outcome } },
    dedupeKey: `holiday:${holiday.publicId}:${order.publicId}`,
  });
}

async function announceRemoved(tx: Tx, orderId: bigint, holiday: Holiday, undone: HolidayUndone): Promise<void> {
  const [order] = await tx.select({ userId: orders.userId, code: orders.deploymentId, publicId: orders.publicId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.userId == null) return;
  // Only a customer who was told about the closure hears about the reopening.
  const outbox = notificationTables.notificationOutbox;
  const [told] = await tx.select({ id: outbox.id }).from(outbox).where(like(outbox.dedupeKey, `holiday:${holiday.publicId}:${order.publicId}:%`)).limit(1);
  if (!told) return;
  const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, order.userId)).limit(1);
  const date = humanDate(holiday.date);
  // The days the holiday added for this order's closed date that are still there (undo removes them when it restores the day).
  const extras = await tx.select({ date: deliveries.deliveryDate }).from(deliveries)
    .innerJoin(sources, eq(deliveries.holidayExtraForDeliveryId, sources.id))
    .where(and(eq(sources.orderId, orderId), eq(sources.deliveryDate, holiday.date))).orderBy(asc(deliveries.deliveryDate));
  const lifted = `Our closure on ${date} has been lifted, but your delivery for that date is not going out.`;
  const outcome = undone.restored.length > 0
    ? `The kitchen is open on ${date} after all, so your delivery goes out that day and nothing is added at the end of your plan.`
    : extras.length > 0
      ? `${lifted} Your extra day on ${extras.map((e) => humanDate(e.date)).join(", ")} stays, so you keep every tiffin.`
      : `${lifted} Our team will place that tiffin on a new day.`;
  await enqueueNotification(tx, {
    event: "holiday_removed",
    recipientId: order.userId,
    title: `Update on ${date}`,
    body: outcome,
    href: "/me/deliveries",
    data: { order: { code: order.code, customerName: user?.name ?? "", holidayName: holiday.name, date, outcome } },
    dedupeKey: `holiday_removed:${holiday.publicId}:${order.publicId}`,
  });
}

/** The per-order loop a declare and a re-apply share. Safe to run again: closed rows are no longer scheduled, and the notice is deduped per order. */
async function applyToOrders(holiday: Holiday, notify: boolean, actorId: bigint | null): Promise<HolidayRun> {
  const affected = await db.selectDistinct({ id: orders.id, code: orders.deploymentId })
    .from(deliveries).innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(
      eq(orders.organizationId, holiday.organizationId), eq(deliveries.deliveryDate, holiday.date),
      eq(deliveries.status, "scheduled"), isNull(deliveries.holidayId),
    ));

  const run: HolidayRun = { closed: 0, needsPlacing: 0, failed: [], removedFromRoute: 0 };
  const stops: OptimoSyncedRow[] = [];
  for (const o of affected) {
    try {
      // One order per transaction: one plan failing must not roll the others back.
      const applied = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${o.id})`);
        const [order] = await tx.select().from(orders).where(eq(orders.id, o.id)).limit(1);
        if (!order) return [];
        const done = await applyHolidaysToOrder(tx, order, actorId);
        const own = done.filter((a) => a.holidayId === holiday.id);
        if (notify && order.userId != null && own.length > 0) await announceDeclared(tx, order, holiday, own);
        return done;
      });
      const own = applied.filter((a) => a.holidayId === holiday.id);
      run.closed += own.length;
      run.needsPlacing += own.filter((a) => a.needsPlacing != null).length;
      stops.push(...applied.map((a) => ({ publicId: a.deliveryPublicId, routeSyncedAt: a.routeSyncedAt })));
    } catch (err) {
      log.error({ err, order: o.code }, "holiday apply failed");
      run.failed.push(o.code ?? String(o.id));
    }
  }
  run.removedFromRoute = await removeStopsBestEffort(stops);
  publishAnalyticsLive();
  return run;
}

export async function createHoliday(
  input: { organizationId: string; date: string; name: string; notify: boolean; confirmToday?: boolean },
  actorId: bigint | null,
  visible: Visible,
): Promise<({ created: true; publicId: string } & HolidayRun) | { created: false; preview: HolidayPreview }> {
  await assertOrgVisible(input.organizationId, visible);
  const name = cleanName(input.name);
  assertRealDate(input.date);
  const now = await today();
  if (input.date < now) throw new ValidationError("A holiday cannot be in the past");
  const [dup] = await db.select({ id: holidays.id }).from(holidays)
    .where(and(eq(holidays.organizationId, input.organizationId), eq(holidays.date, input.date))).limit(1);
  if (dup) throw new ValidationError(`${humanDate(input.date)} is already a holiday`);
  if (input.date === now && !input.confirmToday) return { created: false, preview: await previewHoliday(input, visible) };

  // The unique index is the real guard against two staff declaring at once.
  const [holiday] = await db.insert(holidays)
    // notifiedAt is the "declared with notices" flag: set before any customer is closed, so a run that dies part-way still re-applies with notices.
    .values({ organizationId: input.organizationId, date: input.date, name, createdBy: actorId, updatedBy: actorId, notifiedAt: input.notify ? Date.now() : null })
    .onConflictDoNothing().returning();
  if (!holiday) throw new ValidationError(`${humanDate(input.date)} is already a holiday`);

  return { created: true, publicId: holiday.publicId, ...(await applyToOrders(holiday, input.notify, actorId)) };
}

/** Runs the declare's loop again for a holiday that stopped part-way, had failures, or missed an order. Customers are told only if the declare told customers. */
export async function reapplyHoliday(publicId: string, actorId: bigint | null, visible: Visible): Promise<HolidayRun> {
  const holiday = await scopedHoliday(publicId, visible);
  if (holiday.date < (await today())) throw new ValidationError("A past holiday cannot be re-applied");
  return applyToOrders(holiday, holiday.notifiedAt != null, actorId);
}

export async function renameHoliday(publicId: string, rawName: string, actorId: bigint | null, visible: Visible): Promise<void> {
  if (!sees(visible)) throw new NotFoundError("Holiday not found");
  const updated = await db.update(holidays).set({ name: cleanName(rawName), updatedBy: actorId })
    .where(and(eq(holidays.publicId, publicId), scope(visible))).returning({ id: holidays.id });
  if (updated.length === 0) throw new NotFoundError("Holiday not found");
}

/**
 * Only before the holiday date. Each order is undone in its own locked transaction; an order that
 * fails is reported and the holiday row stays, so removing again finishes the job.
 */
export async function removeHoliday(publicId: string, actorId: bigint | null, visible: Visible): Promise<{ restored: number; left: number; failed: string[]; removed: boolean }> {
  const holiday = await scopedHoliday(publicId, visible);
  if (holiday.date <= (await today())) throw new ValidationError("Only a future holiday can be removed");

  const tagged = await db.selectDistinct({ id: deliveries.orderId, code: orders.deploymentId })
    .from(deliveries).innerJoin(orders, eq(orders.id, deliveries.orderId)).where(eq(deliveries.holidayId, holiday.id));
  const out = { restored: 0, left: 0, failed: [] as string[], removed: false };
  const stops: OptimoSyncedRow[] = [];
  for (const o of tagged) {
    try {
      const undone = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${o.id})`);
        const res = await undoHolidayForOrder(tx, o.id, holiday.id, actorId);
        if (res.restored.length + res.left.length > 0) await announceRemoved(tx, o.id, holiday, res);
        return res;
      });
      out.restored += undone.restored.length;
      out.left += undone.left.length;
      stops.push(...undone.stops);
    } catch (err) {
      log.error({ err, order: o.code }, "holiday undo failed");
      out.failed.push(o.code ?? String(o.id));
    }
  }
  // The added rows are gone from the database; take their stops off the route too.
  await deleteFromOptimoRouteBestEffort(stops);
  if (out.failed.length === 0) {
    try {
      await db.delete(holidays).where(eq(holidays.id, holiday.id));
      out.removed = true;
    } catch (err) {
      // A delivery was closed for this holiday after the loop read its list: the row stays until that one is undone too (remove again).
      const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
      if (code !== "23503") throw err;
      log.error({ err, holiday: holiday.publicId }, "holiday delete blocked by a newly closed delivery");
    }
  }
  publishAnalyticsLive();
  return out;
}

/** Staff place a closed day the system left waiting (a trial, or a plan with another plan right after it). */
export async function placeHolidayDay(deliveryPublicId: string, fromDate: string, actorId: bigint | null, visible: Visible): Promise<string[]> {
  if (!sees(visible)) throw new NotFoundError("Delivery not found");
  const [found] = await db.select({ id: deliveries.id, orderId: deliveries.orderId }).from(deliveries)
    .innerJoin(holidays, eq(holidays.id, deliveries.holidayId))
    .where(and(eq(deliveries.publicId, deliveryPublicId), scope(visible))).limit(1);
  if (!found) throw new NotFoundError("Delivery not found");
  const dates = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${found.orderId})`);
    const [order] = await tx.select().from(orders).where(eq(orders.id, found.orderId)).limit(1);
    if (!order) throw new NotFoundError("Delivery not found");
    return placeHolidayExtras(tx, order, found.id, fromDate, actorId);
  });
  publishAnalyticsLive();
  return dates;
}

export async function listHolidays(visible: Visible): Promise<HolidayRow[]> {
  if (!sees(visible)) return [];
  return db.select({
    publicId: holidays.publicId, date: holidays.date, name: holidays.name, organizationId: holidays.organizationId,
    organizationName: organization.name, createdAt: holidays.createdAt, declaredBy: users.name,
    closed: sql<number>`(select count(*)::int from ${deliveries} where ${deliveries.holidayId} = ${holidays.id})`,
  }).from(holidays)
    .innerJoin(organization, eq(organization.id, holidays.organizationId))
    .leftJoin(users, eq(users.id, holidays.createdBy))
    .where(scope(visible)).orderBy(desc(holidays.date));
}

/** Closed days whose tiffins have nowhere to go yet, on plans that are still running. */
export async function listNeedsPlacing(visible: Visible): Promise<NeedsPlacingRow[]> {
  if (!sees(visible)) return [];
  const rows = await db.select({
    deliveryPublicId: deliveries.publicId, date: deliveries.deliveryDate, status: deliveries.status, tiffins: deliveries.tiffinUnits,
    holidayPublicId: holidays.publicId, holidayName: holidays.name,
    orderPublicId: orders.publicId, orderCode: orders.deploymentId, customerName: orders.fullName, trialLength: orders.trialLength,
  }).from(deliveries)
    .innerJoin(holidays, eq(holidays.id, deliveries.holidayId))
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(
      inArray(deliveries.status, ["paused", "skipped"]), gt(deliveries.tiffinUnits, 0), not(MOVED_AWAY),
      inArray(orders.status, ["active", "paused"]), scope(visible),
    ))
    .orderBy(desc(holidays.date), asc(orders.deploymentId));
  return rows.map(({ status, trialLength, ...r }) => ({ ...r, trial: trialLength != null, held: status === "skipped" }));
}

/** Exactly the organizations createHoliday accepts for this caller; the brand organization first. */
export async function listDeclarableOrganizations(visible: Visible): Promise<{ id: string; name: string }[]> {
  if (!sees(visible)) return [];
  return db.select({ id: organization.id, name: organization.name }).from(organization)
    .where(visible === "all" ? undefined : inArray(organization.id, visible))
    .orderBy(sql`${organization.parentOrganizationId} is not null`, asc(organization.name));
}

/** Banner data for the Labels and Dispatch day pages. Past holidays count: the day was closed. */
export async function holidaysOn(date: string, visible: Visible): Promise<{ name: string; organizationName: string }[]> {
  if (!sees(visible)) return [];
  return db.select({ name: holidays.name, organizationName: organization.name }).from(holidays)
    .innerJoin(organization, eq(organization.id, holidays.organizationId))
    .where(and(eq(holidays.date, date), scope(visible))).orderBy(asc(organization.name));
}

/** Date to name for the organizations this customer has plans with; drives the move sheet. */
export async function holidayNamesForUser(userId: bigint, from: string): Promise<Record<string, string>> {
  const rows = await db.selectDistinct({ date: holidays.date, name: holidays.name }).from(holidays)
    .innerJoin(orders, eq(orders.organizationId, holidays.organizationId))
    .where(and(eq(orders.userId, userId), gte(holidays.date, from)));
  return Object.fromEntries(rows.map((r) => [r.date, r.name]));
}

/** Dates a new checkout cannot start on. New orders are stamped with the brand organization. */
export async function checkoutHolidayDates(from: string): Promise<string[]> {
  const rows = await db.select({ date: holidays.date }).from(holidays)
    .innerJoin(organization, eq(organization.id, holidays.organizationId))
    .where(and(isNull(organization.parentOrganizationId), gte(holidays.date, from)));
  return rows.map((r) => r.date);
}
