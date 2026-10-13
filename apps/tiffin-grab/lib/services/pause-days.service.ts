import { ValidationError, zonedDateIso } from "@foundry/commons";
import { and, eq, gt, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, subscriptionPauses } from "@/db/schema";
import { deleteFromOptimoRouteBestEffort, type OptimoSyncedRow } from "./deliveries.service";
import { assertDaysPauseAllowed } from "./pause-limits.service";
import { getAppSettings } from "./app-settings.service";
import { publishAnalyticsLive } from "@/lib/realtime/publish-inbox";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function uniqueDates(dates: string[]): string[] {
  if (dates.length === 0) throw new ValidationError("Choose at least one delivery day");
  if (dates.some((d) => !ISO.test(d))) throw new ValidationError("Pause dates must be ISO YYYY-MM-DD");
  return [...new Set(dates)].sort();
}

async function orderByPublicId(publicId: string) {
  const [order] = await db.select({
    id: orders.id,
    status: orders.status,
    trialLength: orders.trialLength,
    publicId: orders.publicId,
  }).from(orders).where(eq(orders.publicId, publicId)).limit(1);
  if (!order) throw new ValidationError("Order not found");
  return order;
}

/** paused only when every future original is paused. A plan with nothing left ahead stays active. */
async function syncOrderPauseStatus(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], orderId: bigint, actorId: bigint | null) {
  const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || (order.status !== "active" && order.status !== "paused")) return;
  const future = await tx.select({ status: deliveries.status }).from(deliveries).where(and(
    eq(deliveries.orderId, orderId),
    isNull(deliveries.makeupForDeliveryId),
    gt(deliveries.cutoffAt, Date.now()),
    ne(deliveries.status, "cancelled"),
  ));
  const next = future.length > 0 && future.every((r) => r.status === "paused") ? "paused" : "active";
  if (next === order.status) return;
  await tx.update(orders).set({ status: next, updatedBy: actorId }).where(eq(orders.id, orderId));
}

/**
 * Pause specific upcoming delivery days. The audit row is closed immediately so another
 * pause is legal while these days are still paused. The one-open unique index stays.
 */
export async function pauseDays(orderPublicId: string, dates: string[], actorId: bigint | null): Promise<number> {
  const wanted = uniqueDates(dates);
  const order = await orderByPublicId(orderPublicId);
  if (order.trialLength != null) throw new ValidationError("A trial can only have its dishes edited.");
  if (order.status !== "active" && order.status !== "paused") {
    throw new ValidationError(`Cannot pause an order that is ${order.status}`);
  }

  let removed: OptimoSyncedRow[] = [];
  const count = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
    const rows = await tx.select().from(deliveries).where(and(
      eq(deliveries.orderId, order.id),
      inArray(deliveries.deliveryDate, wanted),
      isNull(deliveries.makeupForDeliveryId),
    ));
    const byDate = new Map(rows.map((r) => [r.deliveryDate, r]));
    const missing = wanted.filter((d) => !byDate.has(d));
    if (missing.length) throw new ValidationError("That date is not a delivery on this plan");
    const now = Date.now();
    const eligible = wanted.flatMap((d) => {
      const row = byDate.get(d)!;
      if (row.status !== "scheduled" || row.cutoffAt <= now) return [];
      return [row];
    });
    if (eligible.length === 0) throw new ValidationError("Cutoff has passed for those days");
    await assertDaysPauseAllowed(order.id, eligible.map((r) => r.deliveryDate));

    const updated = await tx.update(deliveries).set({
      status: "paused",
      routeSyncedAt: null,
      routeDriverSerial: null,
      routeDriverName: null,
      routeStopNumber: null,
    }).where(and(
      inArray(deliveries.id, eligible.map((r) => r.id)),
      eq(deliveries.status, "scheduled"),
      gt(deliveries.cutoffAt, now),
    )).returning({ id: deliveries.id, publicId: deliveries.publicId, routeSyncedAt: deliveries.routeSyncedAt, deliveryDate: deliveries.deliveryDate });

    if (updated.length === 0) throw new ValidationError("Cutoff has passed for those days");
    const pausedDates = updated.map((r) => r.deliveryDate).sort();
    await tx.insert(subscriptionPauses).values({
      orderId: order.id,
      fromDate: pausedDates[0]!,
      untilDate: pausedDates[pausedDates.length - 1]!,
      isIndefinite: false,
      deliveryDates: pausedDates,
      releasedDates: [],
      // Closed on insert. The live set is deliveries.status, not an open vacation row.
      resumedAt: new Date(),
      createdBy: actorId,
    });
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "paused",
      note: pausedDates.join(", "),
      createdBy: actorId,
    });
    await syncOrderPauseStatus(tx, order.id, actorId);
    removed = eligible
      .filter((r) => updated.some((u) => u.id === r.id))
      .map((r) => ({ publicId: r.publicId, routeSyncedAt: r.routeSyncedAt }));
    return updated.length;
  });
  await deleteFromOptimoRouteBestEffort(removed);
  publishAnalyticsLive();
  return count;
}

/** Put paused days back on the same dates. "all" is every paused day still before cutoff. */
export async function releasePausedDays(orderPublicId: string, dates: string[] | "all", actorId: bigint | null): Promise<number> {
  const order = await orderByPublicId(orderPublicId);
  if (order.status !== "active" && order.status !== "paused") {
    throw new ValidationError(`Cannot resume an order that is ${order.status}`);
  }
  const wanted = dates === "all" ? null : uniqueDates(dates);

  const count = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
    const now = Date.now();
    const conds = [
      eq(deliveries.orderId, order.id),
      eq(deliveries.status, "paused"),
      gt(deliveries.cutoffAt, now),
    ];
    if (wanted) conds.push(inArray(deliveries.deliveryDate, wanted));
    const updated = await tx.update(deliveries).set({ status: "scheduled" }).where(and(...conds))
      .returning({ id: deliveries.id, deliveryDate: deliveries.deliveryDate });
    if (updated.length === 0) throw new ValidationError("Cutoff has passed for those days");
    const back = new Set(updated.map((r) => r.deliveryDate));
    const logs = await tx.select({
      id: subscriptionPauses.id,
      deliveryDates: subscriptionPauses.deliveryDates,
      releasedDates: subscriptionPauses.releasedDates,
    }).from(subscriptionPauses).where(eq(subscriptionPauses.orderId, order.id));
    for (const log of logs) {
      const add = (log.deliveryDates ?? []).filter((d) => back.has(d) && !(log.releasedDates ?? []).includes(d));
      if (add.length === 0) continue;
      await tx.update(subscriptionPauses).set({ releasedDates: [...(log.releasedDates ?? []), ...add] }).where(eq(subscriptionPauses.id, log.id));
    }
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "resumed",
      note: updated.map((r) => r.deliveryDate).sort().join(", "),
      createdBy: actorId,
    });
    await syncOrderPauseStatus(tx, order.id, actorId);
    return updated.length;
  });
  publishAnalyticsLive();
  return count;
}

/**
 * A paused day whose cutoff has passed did not go out. It becomes a hold.
 * This does not put the day back on the schedule. Replaces the old auto-resume.
 */
export async function lapseElapsedPauses(orderId: bigint): Promise<void> {
  const now = Date.now();
  const today = zonedDateIso(now, (await getAppSettings()).timezone);
  let changed = false;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const lapsed = await tx.update(deliveries).set({
      status: "skipped",
      routeSyncedAt: null,
      routeDriverSerial: null,
      routeDriverName: null,
      routeStopNumber: null,
    }).where(and(
      eq(deliveries.orderId, orderId),
      eq(deliveries.status, "paused"),
      lte(deliveries.cutoffAt, now),
    )).returning({ id: deliveries.id, deliveryDate: deliveries.deliveryDate });
    if (lapsed.length > 0) {
      changed = true;
      await tx.insert(orderActivities).values(lapsed.map((r) => ({
        orderId,
        deliveryId: r.id,
        type: "skipped" as const,
        note: `Pause reached cutoff on ${r.deliveryDate}`,
      })));
    }
    const open = await tx.select({
      id: subscriptionPauses.id,
      untilDate: subscriptionPauses.untilDate,
      isIndefinite: subscriptionPauses.isIndefinite,
    }).from(subscriptionPauses).where(and(eq(subscriptionPauses.orderId, orderId), isNull(subscriptionPauses.resumedAt)));
    const elapsed = open.filter((r) => !r.isIndefinite && r.untilDate < today);
    if (elapsed.length > 0) {
      changed = true;
      await tx.update(subscriptionPauses).set({ resumedAt: new Date() }).where(inArray(subscriptionPauses.id, elapsed.map((r) => r.id)));
    }
    const [before] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
    await syncOrderPauseStatus(tx, orderId, null);
    const [after] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (before && after && before.status !== after.status) changed = true;
  });
  if (changed) publishAnalyticsLive();
}
