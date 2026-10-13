"use server";

import type { DropOffValue } from "@/lib/catalog/drop-off";
import { revalidatePath } from "next/cache";
import type { AddressInput } from "@foundry/address";
import { NotFoundError } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { assertCanManageDelivery, assertCanManageOrder, assertOrderUnlocked } from "@/lib/services/customer-deliveries.service";
import { setDeliveryAddress, clearDeliveryAddress, rescheduleDelivery } from "@/lib/services/deliveries.service";
import { listPauseDays, pauseDays, releasePausedDays } from "@/lib/services/pause-days.service";
import { applyDeliverySwap, removeDeliverySwap } from "@/lib/services/category-swaps.service";
import { listValidSwapOptionsForDelivery } from "@/lib/services/swap-options.service";
import type { SwapOption } from "@/lib/menu/meal-validation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { runAction, type ActionResult } from "../action-result";

// Every action gates with assertCanManage* (owner OR staff) before mutating, then stamps the
// acting user (currentUserId) — so an admin acting on a customer's order is audited as the admin.

async function revalidateDeliverySurfaces(orderPublicId: string) {
  revalidatePath("/me", "layout");
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

export async function setMyDeliveryAddress(
  deliveryPublicId: string,
  pick: { addressPublicId?: string; newAddress?: AddressInput; dropOff?: DropOffValue },
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
    else revalidatePath("/me", "layout");
  });
}

export async function clearMyDeliveryAddress(deliveryPublicId: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    await clearDeliveryAddress(deliveryPublicId, await currentUserId());
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me", "layout");
  });
}

export type PauseDayChoice = { date: string; paused: boolean };

export async function loadMyPauseDays(orderPublicId: string): Promise<ActionResult<{ days: PauseDayChoice[] }>> {
  return runAction(async () => {
    await assertCanManageOrder(orderPublicId);
    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, orderPublicId)).limit(1);
    if (!order) throw new NotFoundError("Subscription not found");
    return { days: await listPauseDays(order.id) };
  });
}

/** `paused` is what the server changed; `skipped` are picked days whose cutoff had already passed. */
export async function pauseMyDays(orderPublicId: string, dates: string[]): Promise<ActionResult<{ paused: string[]; skipped: string[] }>> {
  return runAction(async () => {
    await assertCanManageOrder(orderPublicId);
    await assertOrderUnlocked(orderPublicId);
    const result = await pauseDays(orderPublicId, dates, await currentUserId());
    await revalidateDeliverySurfaces(orderPublicId);
    return result;
  });
}

export async function releaseMyDays(orderPublicId: string, dates: string[] | "all"): Promise<ActionResult<{ dates: string[] }>> {
  return runAction(async () => {
    await assertCanManageOrder(orderPublicId);
    await assertOrderUnlocked(orderPublicId);
    const resumed = await releasePausedDays(orderPublicId, dates, await currentUserId());
    await revalidateDeliverySurfaces(orderPublicId);
    return { dates: resumed };
  });
}

/**
 * Authoritative swap cards for the customer sheet. Renders `validBundles` only —
 * never recompute TU/divisibility/caps in React.
 */
export async function loadMySwapOptions(
  deliveryPublicId: string,
  forDate?: string,
  provisionalSwaps?: { fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number; fromRow?: number | null; receiveTu?: number | null }[],
  omitSwapPublicIds?: string[],
): Promise<ActionResult<{ options: SwapOption[] }>> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    const options = await listValidSwapOptionsForDelivery(deliveryPublicId, {
      forDate,
      hideUnavailable: true,
      provisionalSwaps,
      omitSwapPublicIds,
    });
    return { options };
  });
}

// Swap eligibility is global now (category_swap_pairs) — there's no per-meal-size
// rule catalog to pick a rule id from, so the client sends the category pair and
// how many picks of fromCategory to give up directly.
export async function applyMyDeliverySwap(deliveryPublicId: string, fromCategory: string, toCategory: string, fromPicks: number, forDate?: string, fromRow?: number | null): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    await applyDeliverySwap(deliveryPublicId, fromCategory, toCategory, fromPicks, await currentUserId(), forDate, fromRow);
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me", "layout");
  });
}

export async function removeMyDeliverySwap(deliveryPublicId: string, appliedSwapPublicId: string, forDate?: string): Promise<ActionResult> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    await removeDeliverySwap(deliveryPublicId, appliedSwapPublicId, await currentUserId(), forDate);
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me", "layout");
  });
}

export async function rescheduleMyDelivery(
  deliveryPublicId: string,
  newDateIso: string,
  /** Which eating day is moving; leave unset (or equal to the trip's own date) to move the whole trip. */
  sourceEatDateIso?: string,
  /** How many of that day's tiffins move (a day can hold several once tiffins have moved onto it). */
  count = 1,
): Promise<ActionResult<{ carriedOn: string; merged: boolean }>> {
  return runAction(async () => {
    await assertCanManageDelivery(deliveryPublicId);
    await assertDeliveryUnlocked(deliveryPublicId);
    const result = await rescheduleDelivery(deliveryPublicId, newDateIso, await currentUserId(), sourceEatDateIso ?? null, count);
    const orderId = await orderPublicIdForDelivery(deliveryPublicId);
    if (orderId) await revalidateDeliverySurfaces(orderId);
    else revalidatePath("/me", "layout");
    return { carriedOn: result.carriedOn, merged: result.merged, message: result.merged ? "merged" : "moved" };
  });
}
