"use server";

import { revalidatePath } from "next/cache";
import { formatMoney, ValidationError } from "@foundry/commons";
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
  changeOrderEatingDays,
  rejectPayment,
  updatePaymentReference,
  setOrderLookOut,
  verifyPayment,
  assertOrderVisible,
  assertDeliveryVisible,
  assertPaymentVisible,
  resolveSessionVisibleOrgIds,
} from "@/lib/services/orders.service";
import { currentUserId } from "@/lib/services/session-service";
import { addOrderAddons, cancelAddonPayment, quoteOrderAddons, regenerateAddonPayment, type AddonQuote, type AddonSelection } from "@/lib/services/order-addons.service";
import { uploadPaymentProof } from "@/lib/services/payment-proof";
import { sendPaymentReminder } from "@/lib/services/payment-reminder";
import { adminSetDeliveryStatus, grantComplimentaryTiffin, isAdminDeliveryStatus, redeliverTrip } from "@/lib/services/deliveries.service";
import { pushOneDelivery, removeOneDelivery } from "@/lib/services/optimoroute/push";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import type { DayOfWeek } from "@/lib/menu/delivery-days";

// Staff of one organization must not act on another's order: every action below checks the
// order (or the order behind the delivery/payment) against the caller's organizations.
const visibleOrgs = async () => resolveSessionVisibleOrgIds(await getSession());

export async function activate(orderId: string) {
  await requireStaff();
  await assertOrderVisible(orderId, await visibleOrgs());
  await activateOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function startMigrated(orderId: string, startDate: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    await startMigratedOrder(orderId, startDate);
  });
  revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function changeStartDateAction(orderId: string, startDate: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    await changeOrderStartDate(orderId, startDate);
  });
  revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function changeEatingDaysAction(orderId: string, days: DayOfWeek[]): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    await changeOrderEatingDays(orderId, days);
  });
  revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function cancel(orderId: string) {
  await requireStaff();
  await assertOrderVisible(orderId, await visibleOrgs());
  await cancelOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function verifyPaymentAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertPaymentVisible(paymentPublicId, await visibleOrgs());
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

function parseAddonSelections(raw: FormDataEntryValue | null): AddonSelection[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : "");
  } catch {
    throw new ValidationError("Pick at least one add-on");
  }
  if (!Array.isArray(parsed)) throw new ValidationError("Pick at least one add-on");
  return parsed.map((s) => {
    const { key, qty } = (s ?? {}) as { key?: unknown; qty?: unknown };
    if (typeof key !== "string" || typeof qty !== "number") throw new ValidationError("Pick at least one add-on");
    return { key, qty };
  });
}

// Display only: the save reprices everything server-side.
export async function quoteOrderAddonsAction(
  orderId: string,
  selections: AddonSelection[],
  methodId: string,
): Promise<ActionResult<{ quote: AddonQuote }>> {
  return runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    return { quote: await quoteOrderAddons(orderId, selections, methodId) };
  });
}

// FormData: selections (JSON), method, expected_amount_due (the quote on screen), reference (optional), proof + proof_thumb (images).
export async function addOrderAddonsAction(orderId: string, form: FormData): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    const selections = parseAddonSelections(form.get("selections"));
    const method = form.get("method");
    const methodId = typeof method === "string" ? method : "";
    const shown = form.get("expected_amount_due");
    const expectedAmountDue = typeof shown === "string" && shown.trim() !== "" ? Number(shown) : NaN;
    if (!Number.isFinite(expectedAmountDue) || expectedAmountDue < 0) throw new ValidationError("Add-on amount missing, reopen the dialog");
    // Every rule runs before the screenshot is stored, so a refused save leaves no orphan file.
    const fresh = await quoteOrderAddons(orderId, selections, methodId);
    if (fresh.amountDue.toFixed(2) !== expectedAmountDue.toFixed(2)) {
      throw new ValidationError(`The amount changed to ${formatMoney(fresh.amountDue)}. Check with the customer and try again.`);
    }
    const actorId = await currentUserId();
    // The first argument only names the storage folder; the payment row does not exist yet.
    const proof = await uploadPaymentProof(orderId, form.get("proof"), form.get("proof_thumb"));
    const ref = form.get("reference");
    await addOrderAddons(
      orderId,
      { selections, methodId, expectedAmountDue, proof, reference: typeof ref === "string" ? ref : null },
      actorId,
    );
  });
  if ("ok" in res) {
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath("/dashboard/payments", "layout");
  }
  return res;
}

export async function rejectPaymentAction(orderId: string, paymentPublicId: string, note: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertPaymentVisible(paymentPublicId, await visibleOrgs());
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
    await assertOrderVisible(orderId, await visibleOrgs());
    await updatePaymentReference(orderId, paymentPublicId, reference, await currentUserId());
  });
  if ("ok" in res) {
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath("/dashboard/payments", "layout");
  }
  return res;
}

/** Any staff member marks, re-notes or unmarks an order on the Look out for tab. */
export async function setLookOutAction(orderId: string, on: boolean, note: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    await setOrderLookOut(orderId, on, note, await currentUserId());
  });
  if ("ok" in res) {
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath("/dashboard/orders");
  }
  return res;
}

export async function sendPaymentReminderAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    await sendPaymentReminder(orderId, paymentPublicId, await currentUserId());
  });
  if ("ok" in res) revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function regenerateAddonLinkAction(orderId: string, paymentPublicId: string): Promise<ActionResult<{ paymentPublicId: string }>> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    await assertPaymentVisible(paymentPublicId, await visibleOrgs());
    return { paymentPublicId: (await regenerateAddonPayment(paymentPublicId, await currentUserId())).paymentPublicId };
  });
  if ("ok" in res) revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function cancelAddonLinkAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderId, await visibleOrgs());
    await assertPaymentVisible(paymentPublicId, await visibleOrgs());
    await cancelAddonPayment(paymentPublicId, await currentUserId());
  });
  if ("ok" in res) revalidatePath(`/dashboard/orders/${orderId}`);
  return res;
}

export async function pushDeliveryToOptimoAction(orderId: string, deliveryPublicId: string, date: string) {
  await requireStaff();
  await assertDeliveryVisible(deliveryPublicId, await visibleOrgs());
  await pushOneDelivery(deliveryPublicId, date, await currentUserId());
  revalidatePath(`/dashboard/orders/${orderId}`);
}

/** Manual removal — deletes this one delivery's stop from OptimoRoute regardless of whether
 *  the day-level stale check has caught up to it yet. */
export async function removeDeliveryFromOptimoAction(orderId: string, deliveryPublicId: string, date: string) {
  await requireStaff();
  await assertDeliveryVisible(deliveryPublicId, await visibleOrgs());
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
    await assertDeliveryVisible(deliveryPublicId, await visibleOrgs());
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
    await assertDeliveryVisible(deliveryPublicId, await visibleOrgs());
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
    await assertOrderVisible(orderId, await visibleOrgs());
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
