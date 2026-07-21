"use server";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/services/session-service";
import { assertCanManageDelivery, assertCanManageOrder } from "@/lib/services/customer-deliveries.service";
import { scheduleFromPool, skipDelivery, unskipDelivery, setDeliveryAddress, clearDeliveryAddress } from "@/lib/services/deliveries.service";
import { pauseOrder, resumeOrder } from "@/lib/services/orders.service";

// Every action gates with assertCanManage* (owner OR staff) before mutating, then stamps the
// acting user (currentUserId) — so an admin acting on a customer's order is audited as the admin.

export async function skipMyDelivery(deliveryPublicId: string) {
  await assertCanManageDelivery(deliveryPublicId); // owner-or-staff gate — before the mutation
  await skipDelivery(deliveryPublicId, await currentUserId());
  revalidatePath("/me/deliveries");
}

export async function unskipMyDelivery(deliveryPublicId: string) {
  await assertCanManageDelivery(deliveryPublicId);
  await unskipDelivery(deliveryPublicId, await currentUserId());
  revalidatePath("/me/deliveries");
}

export async function setMyDeliveryAddress(
  deliveryPublicId: string,
  input: { fullName: string; addressLine: string; city: string; postalCode: string },
) {
  await assertCanManageDelivery(deliveryPublicId);
  await setDeliveryAddress(deliveryPublicId, input, await currentUserId());
  revalidatePath("/me/deliveries");
}

export async function clearMyDeliveryAddress(deliveryPublicId: string) {
  await assertCanManageDelivery(deliveryPublicId);
  await clearDeliveryAddress(deliveryPublicId, await currentUserId());
  revalidatePath("/me/deliveries");
}

export async function pauseMySubscription(
  orderPublicId: string,
  window: { from: string; until: string; indefinite?: boolean },
) {
  await assertCanManageOrder(orderPublicId);
  await pauseOrder(orderPublicId, window);
  revalidatePath("/me/deliveries");
}

// `fromDate` (ISO) resumes a vacation partway: earlier paused days move to the remain pool.
export async function resumeMySubscription(orderPublicId: string, fromDate?: string) {
  await assertCanManageOrder(orderPublicId);
  await resumeOrder(orderPublicId, (await currentUserId()) ?? undefined, fromDate);
  revalidatePath("/me/deliveries");
}

// Turns one pooled tiffin into a real delivery on `dateIso` (must be after the last delivery and
// a plan weekday — enforced server-side in scheduleFromPool).
export async function scheduleMyPooledTiffin(orderPublicId: string, dateIso: string) {
  await assertCanManageOrder(orderPublicId);
  await scheduleFromPool(orderPublicId, dateIso, await currentUserId());
  revalidatePath("/me/deliveries");
}
