"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import {
  activateOrder,
  cancelOrder,
  changeMealSize,
  rejectPayment,
  verifyPayment,
} from "@/lib/services/orders.service";
import { currentUserId } from "@/lib/services/session-service";
import { redeliverTrip } from "@/lib/services/deliveries.service";
import { pushOneDelivery, removeOneDelivery } from "@/lib/services/optimoroute/push";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

export async function activate(orderId: string) {
  await requireStaff();
  await activateOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
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
  }
  return res;
}

/** Manual "redo the push" for one delivery — the fix when a scheduled push went wrong. */
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
