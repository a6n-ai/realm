"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { activateOrder, cancelOrder, pauseOrder, readOrder, resumeOrder } from "@/lib/services/orders.service";
import {
  maybeComplete,
  pauseRange,
  resumeOrder as resumeDeliveryRange,
  setDeliveryAddress,
  skipDelivery,
  unskipDelivery,
} from "@/lib/services/deliveries.service";

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
export async function pause(orderId: string, window: { from: string; until: string }) {
  await requireStaff();
  await pauseOrder(orderId, window);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function resume(orderId: string) {
  await requireStaff();
  await resumeOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function skipDeliveryAction(orderId: string, deliveryPublicId: string) {
  await requireStaff();
  await skipDelivery(deliveryPublicId);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function unskipDeliveryAction(orderId: string, deliveryPublicId: string) {
  await requireStaff();
  await unskipDelivery(deliveryPublicId);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function editDeliveryAddress(
  orderId: string,
  deliveryPublicId: string,
  input: { fullName: string; addressLine: string; city: string; postalCode: string },
) {
  await requireStaff();
  await setDeliveryAddress(deliveryPublicId, input);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

// Row-level pause/resume, distinct from pause()/resume() above: those flip the order's own
// status through orders.service and only succeed on a whole-schedule pause. These act directly
// on the delivery rows in a date window without touching order.status, for partial pauses.
export async function pauseDeliveryRange(orderId: string, window: { from: string; until: string }) {
  await requireStaff();
  await pauseRange(orderId, window.from, window.until);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function resumeDeliveryRangeAction(orderId: string) {
  await requireStaff();
  await resumeDeliveryRange(orderId);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
