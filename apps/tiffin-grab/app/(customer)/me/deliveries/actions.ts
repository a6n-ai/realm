"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { AddressInput } from "@foundry/address";
import { NotFoundError } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { assertCanManageDelivery, assertCanManageOrder, assertOrderUnlocked } from "@/lib/services/customer-deliveries.service";
import { scheduleFromPool, skipDelivery, unskipDelivery, setDeliveryAddress, clearDeliveryAddress, rescheduleDelivery } from "@/lib/services/deliveries.service";
import { formatMissedDays } from "@/lib/menu/coverage";
import { pauseOrder, resumeOrder } from "@/lib/services/orders.service";
import { applyDeliverySwap, removeDeliverySwap } from "@/lib/services/category-swaps.service";
import { listValidSwapOptionsForDelivery } from "@/lib/services/swap-options.service";
import type { SwapOption } from "@/lib/menu/meal-validation";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { runAction, type ActionResult } from "../action-result";

// Every action gates with assertCanManage* (owner OR staff) before mutating, then stamps the
// acting user (currentUserId) — so an admin acting on a customer's order is audited as the admin.

async function revalidateDeliverySurfaces(orderPublicId: string) {
  revalidatePath("/me");
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

// While an e-Transfer is unconfirmed the customer may only pick meals, so every action here
// refuses. Staff bypass inside assertOrderUnlocked.
async function assertDeliveryUnlocked(deliveryPublicId: string) {
  const orderId = await orderPublicIdForDelivery(deliveryPublicId);
  if (orderId) await assertOrderUnlocked(orderId);
}

export async function skipMyDelivery(deliveryPublicId: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    const { missedDates } = await skipDelivery(deliveryPublicId, await currentUserId());
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me");
    return `${formatMissedDays(missedDates)} tiffins will be added to your pool`;
  });
}

export async function unskipMyDelivery(deliveryPublicId: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    await unskipDelivery(deliveryPublicId, await currentUserId());
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me");
  });
}

export async function setMyDeliveryAddress(
  deliveryPublicId: string,
  pick: { addressPublicId: string } | { newAddress: AddressInput },
): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    // The order owner's address book — staff acting for a customer use the customer's addresses.
    const [owner] = await db
      .select({ userId: orders.userId, orgId: orders.organizationId })
      .from(deliveries)
      .innerJoin(orders, eq(deliveries.orderId, orders.id))
      .where(eq(deliveries.publicId, deliveryPublicId))
      .limit(1);
    if (!owner?.userId) throw new NotFoundError("Delivery not found");
    await setDeliveryAddress(deliveryPublicId, pick, { userId: owner.userId, orgId: owner.orgId }, await currentUserId());
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me");
  });
}

export async function clearMyDeliveryAddress(deliveryPublicId: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    await clearDeliveryAddress(deliveryPublicId, await currentUserId());
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me");
  });
}

export async function pauseMySubscription(
  orderPublicId: string,
  window: { from: string; until: string; indefinite?: boolean },
): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageOrder(orderPublicId);
    await assertOrderUnlocked(orderPublicId);
    await pauseOrder(orderPublicId, window);
    await revalidateDeliverySurfaces(orderPublicId);
  });
}

// `fromDate` (ISO) resumes a vacation partway: earlier paused days move to the remain pool.
export async function resumeMySubscription(orderPublicId: string, fromDate?: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageOrder(orderPublicId);
    await assertOrderUnlocked(orderPublicId);
    await resumeOrder(orderPublicId, (await currentUserId()) ?? undefined, fromDate);
    await revalidateDeliverySurfaces(orderPublicId);
  });
}

// Turns one pooled tiffin into a real delivery on `dateIso` (must be after the last delivery and
// a plan weekday — enforced server-side in scheduleFromPool).
export async function scheduleMyPooledTiffin(
  orderPublicId: string,
  dateIso: string,
): Promise<ActionResult<{ carriedOn: string; merged: boolean }>> {
  return runAction(async () => {
    await assertCanManageOrder(orderPublicId);
    await assertOrderUnlocked(orderPublicId);
    const result = await scheduleFromPool(orderPublicId, dateIso, await currentUserId());
    await revalidateDeliverySurfaces(orderPublicId);
    return { carriedOn: result.carriedOn, merged: result.merged };
  });
}

/**
 * Authoritative swap cards for the customer sheet. Renders `validBundles` only —
 * never recompute TU/divisibility/caps in React.
 */
export async function loadMySwapOptions(
  deliveryPublicId: string,
  forDate?: string,
): Promise<ActionResult<{ options: SwapOption[] }>> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    const options = await listValidSwapOptionsForDelivery(deliveryPublicId, {
      forDate,
      hideUnavailable: true,
    });
    return { options };
  });
}

// Swap eligibility is global now (category_swap_pairs) — there's no per-meal-size
// rule catalog to pick a rule id from, so the client sends the category pair and
// how many picks of fromCategory to give up directly.
export async function applyMyDeliverySwap(deliveryPublicId: string, fromCategory: string, toCategory: string, fromPicks: number, forDate?: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    await applyDeliverySwap(deliveryPublicId, fromCategory, toCategory, fromPicks, await currentUserId(), forDate);
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me");
  });
}

export async function removeMyDeliverySwap(deliveryPublicId: string, appliedSwapPublicId: string, forDate?: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    await removeDeliverySwap(deliveryPublicId, appliedSwapPublicId, await currentUserId(), forDate);
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me");
  });
}

export async function rescheduleMyDelivery(
  deliveryPublicId: string,
  newDateIso: string,
  /** Which eating day is moving; leave unset (or equal to the trip's own date) to move the whole trip. */
  sourceEatDateIso?: string,
): Promise<ActionResult<{ carriedOn: string; merged: boolean }>> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    const result = await rescheduleDelivery(deliveryPublicId, newDateIso, await currentUserId(), sourceEatDateIso ?? null);
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me");
    return { carriedOn: result.carriedOn, merged: result.merged, message: result.merged ? "merged" : "moved" };
  });
}
