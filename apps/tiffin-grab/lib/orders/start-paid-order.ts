import { eq } from "drizzle-orm";
import { type Tx } from "@/db/client";
import { orderActivities, orders, plans } from "@/db/schema";
import { ValidationError } from "@foundry/commons";
import { utcIso } from "@foundry/commons/util/dates";
import { scheduleWrite } from "@/lib/deliveries/holiday-apply";
import { upcomingHolidays } from "@/lib/deliveries/holiday-dates";
import { enqueueStaffNotification } from "@/lib/notifications/enqueue";
import { lockOrder } from "@/lib/orders/order-lock";
import { assertStartable } from "@/lib/orders/order-window";
import { paidStartDate } from "@/lib/orders/paid-start";
import { appToday } from "@/lib/dates/start-date";
import { ENDED, inOrderStatuses } from "@/lib/orders/status";
import { getAppSettings } from "@/lib/settings";

/** Staff alert for money taken on an order that cannot start; one alert per order. */
export function notifyPaidNotStarted(tx: Tx, order: { organizationId: string | null; publicId: string; deploymentId: string }, note: string) {
  return enqueueStaffNotification(tx, {
    organizationId: order.organizationId,
    title: "Card payment needs attention",
    body: `${note} · order ${order.deploymentId}`,
    href: `/dashboard/orders/${order.publicId}`,
    dedupeKey: `paid_not_started:${order.publicId}`,
  });
}

async function flagPaidNotStarted(tx: Tx, order: typeof orders.$inferSelect, note: string, actorId: bigint | null) {
  await tx.insert(orderActivities).values({ orderId: order.id, type: "note", note, createdBy: actorId });
  await notifyPaidNotStarted(tx, order, note);
}

// A pending Stripe order starts when its payment settles. Pending orders reserve no days, so
// the overlap guard runs here with the final dates. A start that can't happen leaves the
// order pending with a note: the money is already in, staff resolve it.
export async function startPaidStripeOrder(tx: Tx, order: typeof orders.$inferSelect, actorId: bigint | null): Promise<{ started: boolean; reason?: string }> {
  await lockOrder(tx, order.id);
  const [current] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id)).for("update").limit(1);
  // Staff cancelled it after settle's outside check: the money is in, nobody else will flag it.
  if (current && inOrderStatuses(ENDED, current.status)) {
    await flagPaidNotStarted(tx, order, `Paid on a ${current.status} order — refund needed`, actorId);
    return { started: false, reason: `order is ${current.status}` };
  }
  if (current?.status !== "pending") return { started: false, reason: `order is ${current?.status ?? "missing"}` };

  const { timezone, cutoffHour } = await getAppSettings();
  const todayBase = appToday(timezone, cutoffHour);
  const closed = new Set((await upcomingHolidays(tx, order.organizationId, utcIso(todayBase))).keys());
  const [plan] = await tx.select({ allowedStartDays: plans.allowedStartDays }).from(plans).where(eq(plans.id, order.planId)).limit(1);
  const startDate = paidStartDate({
    chosen: order.startDate,
    allowedStartDays: plan?.allowedStartDays ?? [],
    trialSendDays: order.trialLength != null ? (order.trialWeekdays ?? []) : null,
    todayBase,
    closed,
  });
  try {
    await assertStartable(tx, { userId: order.userId!, organizationId: order.organizationId, startDate, durationWeeks: order.durationWeeks, excludeOrderId: order.id, holiday: false });
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    await flagPaidNotStarted(tx, order, `Paid, but could not start: ${e.message}`, actorId);
    return { started: false, reason: e.message };
  }
  const [row] = await tx.update(orders).set({ status: "active", startDate, updatedBy: actorId }).where(eq(orders.id, order.id)).returning();
  await tx.insert(orderActivities).values({
    orderId: order.id,
    type: "activated",
    fromStatus: "pending",
    toStatus: "active",
    note: startDate === order.startDate ? null : `Start moved to ${startDate}`,
    createdBy: actorId,
  });
  await scheduleWrite(tx, row!, actorId, { materialize: true });
  return { started: true };
}
