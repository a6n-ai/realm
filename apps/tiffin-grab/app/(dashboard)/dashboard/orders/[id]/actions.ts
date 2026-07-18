"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { activateOrder, cancelOrder, pauseOrder, readOrder, resumeOrder } from "@/lib/services/orders.service";
import { currentUserId } from "@/lib/services/session-service";
import {
  maybeComplete,
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
export async function pause(orderId: string, window: { from: string; until: string; indefinite?: boolean }) {
  await requireStaff();
  await pauseOrder(orderId, window);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function resume(orderId: string) {
  await requireStaff();
  const actorId = await currentUserId();
  await resumeOrder(orderId, actorId ?? undefined);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function skipDeliveryAction(orderId: string, deliveryPublicId: string) {
  await requireStaff();
  const actorId = await currentUserId();
  await skipDelivery(deliveryPublicId, actorId);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function unskipDeliveryAction(orderId: string, deliveryPublicId: string) {
  await requireStaff();
  const actorId = await currentUserId();
  await unskipDelivery(deliveryPublicId, actorId);
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
  const actorId = await currentUserId();
  await setDeliveryAddress(deliveryPublicId, input, actorId);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

// Row-level pause/resume buttons on the deliveries panel. These route through the same
// orders.service.pause/resume as LifecycleControls (not deliveries.service directly) so
// order.status stays the single source of truth no matter which UI surface is used.
export async function pauseDeliveryRange(orderId: string, window: { from: string; until: string }) {
  await requireStaff();
  await pauseOrder(orderId, window);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function resumeDeliveryRangeAction(orderId: string) {
  await requireStaff();
  await resumeOrder(orderId);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
