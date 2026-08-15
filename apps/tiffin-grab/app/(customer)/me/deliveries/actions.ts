"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUserId } from "@/lib/services/session-service";
import { assertCanManageDelivery, assertCanManageOrder } from "@/lib/services/customer-deliveries.service";
import { scheduleFromPool, skipDelivery, unskipDelivery, setDeliveryAddress, clearDeliveryAddress, rescheduleDelivery } from "@/lib/services/deliveries.service";
import { pauseOrder, resumeOrder } from "@/lib/services/orders.service";
import { applyDeliverySwap, removeDeliverySwap } from "@/lib/services/category-swaps.service";
import { db } from "@/db/client";
import { categorySwapRules, deliveries, orders } from "@/db/schema";
import { ValidationError } from "@realm/commons";

// Every action gates with assertCanManage* (owner OR staff) before mutating, then stamps the
// acting user (currentUserId) — so an admin acting on a customer's order is audited as the admin.

async function revalidateDeliverySurfaces(orderPublicId: string) {
  revalidatePath("/me/deliveries");
  revalidatePath(`/dashboard/orders/${orderPublicId}`);
  revalidatePath("/dashboard/orders");
}

async function orderPublicIdForDelivery(deliveryPublicId: string): Promise<string | null> {
  const [row] = await db
    .select({ publicId: orders.publicId })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(eq(deliveries.publicId, deliveryPublicId))
    .limit(1);
  return row?.publicId ?? null;
}

export async function skipMyDelivery(deliveryPublicId: string) {
  await assertCanManageDelivery(deliveryPublicId);
  await skipDelivery(deliveryPublicId, await currentUserId());
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await revalidateDeliverySurfaces(orderId);
  else revalidatePath("/me/deliveries");
}

export async function unskipMyDelivery(deliveryPublicId: string) {
  await assertCanManageDelivery(deliveryPublicId);
  await unskipDelivery(deliveryPublicId, await currentUserId());
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await revalidateDeliverySurfaces(orderId);
  else revalidatePath("/me/deliveries");
}

export async function setMyDeliveryAddress(
  deliveryPublicId: string,
  input: { fullName: string; addressLine: string; city: string; postalCode: string },
) {
  await assertCanManageDelivery(deliveryPublicId);
  await setDeliveryAddress(deliveryPublicId, input, await currentUserId());
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await revalidateDeliverySurfaces(orderId);
  else revalidatePath("/me/deliveries");
}

export async function clearMyDeliveryAddress(deliveryPublicId: string) {
  await assertCanManageDelivery(deliveryPublicId);
  await clearDeliveryAddress(deliveryPublicId, await currentUserId());
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await revalidateDeliverySurfaces(orderId);
  else revalidatePath("/me/deliveries");
}

export async function pauseMySubscription(
  orderPublicId: string,
  window: { from: string; until: string; indefinite?: boolean },
) {
  await assertCanManageOrder(orderPublicId);
  await pauseOrder(orderPublicId, window);
  await revalidateDeliverySurfaces(orderPublicId);
}

// `fromDate` (ISO) resumes a vacation partway: earlier paused days move to the remain pool.
export async function resumeMySubscription(orderPublicId: string, fromDate?: string) {
  await assertCanManageOrder(orderPublicId);
  await resumeOrder(orderPublicId, (await currentUserId()) ?? undefined, fromDate);
  await revalidateDeliverySurfaces(orderPublicId);
}

// Turns one pooled tiffin into a real delivery on `dateIso` (must be after the last delivery and
// a plan weekday — enforced server-side in scheduleFromPool).
export async function scheduleMyPooledTiffin(orderPublicId: string, dateIso: string) {
  await assertCanManageOrder(orderPublicId);
  await scheduleFromPool(orderPublicId, dateIso, await currentUserId());
  await revalidateDeliverySurfaces(orderPublicId);
}

async function resolveSwapRuleId(rulePublicId: string): Promise<bigint> {
  const [row] = await db.select({ id: categorySwapRules.id }).from(categorySwapRules)
    .where(eq(categorySwapRules.publicId, rulePublicId)).limit(1);
  if (!row) throw new ValidationError("Swap rule not found");
  return row.id;
}

export async function applyMyDeliverySwap(deliveryPublicId: string, rulePublicId: string) {
  await assertCanManageDelivery(deliveryPublicId);
  const ruleId = await resolveSwapRuleId(rulePublicId);
  await applyDeliverySwap(deliveryPublicId, ruleId, await currentUserId());
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await revalidateDeliverySurfaces(orderId);
  else revalidatePath("/me/deliveries");
}

export async function removeMyDeliverySwap(deliveryPublicId: string, appliedSwapPublicId: string) {
  await assertCanManageDelivery(deliveryPublicId);
  await removeDeliverySwap(deliveryPublicId, appliedSwapPublicId, await currentUserId());
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await revalidateDeliverySurfaces(orderId);
  else revalidatePath("/me/deliveries");
}

export async function rescheduleMyDelivery(deliveryPublicId: string, newDateIso: string) {
  await assertCanManageDelivery(deliveryPublicId);
  await rescheduleDelivery(deliveryPublicId, newDateIso, await currentUserId());
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await revalidateDeliverySurfaces(orderId);
  else revalidatePath("/me/deliveries");
}
