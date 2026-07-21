"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { activateOrder, cancelOrder, pauseOrder, readOrder, resumeOrder } from "@/lib/services/orders.service";
import { currentUserId } from "@/lib/services/session-service";
import {
  clearDeliveryAddress,
  maybeComplete,
  scheduleFromPool,
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
// `fromDate` (ISO) resumes a vacation partway: earlier paused days move to the remain pool, same
// as the customer's resume-from. Omit for a full resume.
export async function resume(orderId: string, fromDate?: string) {
  await requireStaff();
  const actorId = await currentUserId();
  await resumeOrder(orderId, actorId ?? undefined, fromDate);
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

// Reset a delivery back to the order's default address (undo a per-delivery override).
export async function clearDeliveryAddressAction(orderId: string, deliveryPublicId: string) {
  await requireStaff();
  const actorId = await currentUserId();
  await clearDeliveryAddress(deliveryPublicId, actorId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

// Place one of the order's pooled tiffins on a real delivery day (after the last delivery, on a
// plan weekday — enforced in scheduleFromPool). Mirrors the customer's scheduleMyPooledTiffin.
export async function scheduleFromPoolAction(orderId: string, dateIso: string) {
  await requireStaff();
  const actorId = await currentUserId();
  await scheduleFromPool(orderId, dateIso, actorId);
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

export async function resumeDeliveryRangeAction(orderId: string, fromDate?: string) {
  await requireStaff();
  const actorId = await currentUserId();
  await resumeOrder(orderId, actorId ?? undefined, fromDate);
  const order = await readOrder(orderId);
  await maybeComplete(order.id);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
