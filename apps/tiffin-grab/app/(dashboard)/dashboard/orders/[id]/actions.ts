"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { memoryBus } from "@foundry/realtime/server";
import { db } from "@/db/client";
import { deliveries, orders, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import {
  activateOrder,
  cancelOrder,
  startMigratedOrder,
  changeOrderStartDate,
  changeMealSize,
  rejectPayment,
  updatePaymentReference,
  verifyPayment,
  assertOrderVisible,
  resolveSessionVisibleOrgIds,
} from "@/lib/services/orders.service";
import { currentUserId } from "@/lib/services/session-service";
import { sendPaymentReminder } from "@/lib/services/payment-reminder";
import { adminSetDeliveryStatus, grantComplimentaryTiffin, isAdminDeliveryStatus, redeliverTrip } from "@/lib/services/deliveries.service";
import { pushOneDelivery, removeOneDelivery } from "@/lib/services/optimoroute/push";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

export async function activate(orderId: string) {
  await requireStaff();
  await activateOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function startMigrated(orderId: string, startDate: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await startMigratedOrder(orderId, startDate);
  });
  revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function changeStartDateAction(orderId: string, startDate: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await changeOrderStartDate(orderId, startDate);
  });
  revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function cancel(orderId: string) {
  await requireStaff();
  await cancelOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function changePlan(orderId: string, mealSizePublicId: string) {
  await requireStaff();
  await changeMealSize(orderId, mealSizePublicId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function verifyPaymentAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    const session = await getSession();
    await verifyPayment(paymentPublicId, { actorId: session?.user?.id ?? null });
  });
  if ("ok" in res) {
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath("/dashboard/payments", "layout");
    revalidatePath("/me/wallet");
    
    // Trigger customer shell SSE refresh
    const order = await db
      .select({ userPublicId: users.publicId })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.publicId, orderId))
      .limit(1);
      
    if (order.length > 0) {
      memoryBus.publish(`refresh:${order[0].userPublicId}`, { type: "message", channel: `refresh:${order[0].userPublicId}` });
    }
  }
  return res;
}

export async function rejectPaymentAction(orderId: string, paymentPublicId: string, note: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await rejectPayment(paymentPublicId, note, await currentUserId());
  });
  if ("ok" in res) {
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath("/dashboard/payments", "layout");
    revalidatePath("/me/wallet");
    
    // Trigger customer shell SSE refresh
    const order = await db
      .select({ userPublicId: users.publicId })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.publicId, orderId))
      .limit(1);
      
    if (order.length > 0) {
      memoryBus.publish(`refresh:${order[0].userPublicId}`, { type: "message", channel: `refresh:${order[0].userPublicId}` });
    }
  }
  return res;
}

export async function updatePaymentReferenceAction(orderId: string, paymentPublicId: string, reference: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await resolveSessionVisibleOrgIds(await getSession()));
    await updatePaymentReference(orderId, paymentPublicId, reference, await currentUserId());
  });
  if ("ok" in res) {
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath("/dashboard/payments", "layout");
  }
  return res;
}

/** Manual "redo the push" for one delivery — the fix when a scheduled push went wrong. */
export async function sendPaymentReminderAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await resolveSessionVisibleOrgIds(await getSession()));
    await sendPaymentReminder(orderId, paymentPublicId, await currentUserId());
  });
  if ("ok" in res) revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function pushDeliveryToOptimoAction(orderId: string, deliveryPublicId: string, date: string) {
  await requireStaff();
  await pushOneDelivery(deliveryPublicId, date, await currentUserId());
  revalidatePath(`/dashboard/orders/${orderId}`);
}

/** Manual removal — deletes this one delivery's stop from OptimoRoute regardless of whether
 *  the day-level stale check has caught up to it yet. */
export async function removeDeliveryFromOptimoAction(orderId: string, deliveryPublicId: string, date: string) {
  await requireStaff();
  await removeOneDelivery(deliveryPublicId, date, await currentUserId());
  revalidatePath(`/dashboard/orders/${orderId}`);
}

/** Admin-only correction of one delivery's outcome. Customers and members cannot call this. */
export async function setDeliveryStatusAction(
  deliveryPublicId: string,
  status: string,
): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireAdmin();
    if (!isAdminDeliveryStatus(status)) throw new ValidationError("Unknown delivery status");
    await adminSetDeliveryStatus(deliveryPublicId, status, await currentUserId());
    return "Delivery status updated";
  });
  if ("ok" in res) {
    const [order] = await db
      .select({ publicId: orders.publicId })
      .from(orders)
      .innerJoin(deliveries, eq(deliveries.orderId, orders.id))
      .where(eq(deliveries.publicId, deliveryPublicId))
      .limit(1);
    if (order) {
      revalidatePath(`/dashboard/orders/${order.publicId}`);
      revalidatePath("/me", "layout");
    }
  }
  return res;
}

/** Driver could not deliver: moves the whole trip to the next delivery day (merging there); the pool is untouched. */
export async function redeliverTripAction(orderId: string, deliveryPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    const { targetDate } = await redeliverTrip(deliveryPublicId, await currentUserId());
    return `Re-delivering on ${targetDate}`;
  });
  if ("ok" in res) {
    revalidatePath(`/dashboard/orders/${orderId}`);
  }
  return res;
}

export async function grantComplimentaryAction(
  orderId: string,
  input: { date: string; note: string; notify: boolean; forDeliveryPublicId?: string | null },
): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireAdmin();
    await assertOrderVisible(orderId, await resolveSessionVisibleOrgIds(await getSession()));
    const { reopened } = await grantComplimentaryTiffin(
      orderId,
      {
        date: String(input.date),
        note: String(input.note),
        notify: input.notify === true,
        forDeliveryPublicId: input.forDeliveryPublicId ? String(input.forDeliveryPublicId) : null,
      },
      await currentUserId(),
    );
    return reopened ? `Plan reopened with a free tiffin on ${input.date}` : `Free tiffin added on ${input.date}`;
  });
  if ("ok" in res) revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}
