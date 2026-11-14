"use server";

import { revalidateOrder } from "@/lib/revalidate";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatMoney, ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guards";
import { setOrderLookOut } from "@/lib/orders/look-out";
import { ordersService } from "@/lib/orders/orders.service";
import { currentUserId } from "@/lib/services/session-service";
import { addOrderAddons, cancelAddonPayment, quoteOrderAddons, regenerateAddonPayment, type AddonQuote, type AddonSelection } from "@/lib/orders/order-addons.service";
import { uploadPaymentProof } from "@/lib/payments/payment-proof";
import { cancelOrderAndOpenPayments } from "@/lib/orders/unpaid-checkouts";
import { adminSetDeliveryStatus, grantComplimentaryTiffin, isAdminDeliveryStatus, redeliverTrip } from "@/lib/deliveries/deliveries.service";
import { pushOneDelivery, removeOneDelivery } from "@/lib/optimoroute/push";
import { ActionResult } from "@/lib/actions/action-result";
import { orderAction } from "@/lib/actions/order-action";
import { DayOfWeek } from "@/lib/menu/delivery-days";

// Staff of one organization must not act on another's order: every action goes through
// assertOrderAccess / orderAction, which check the order (or the order behind the delivery or
// payment) against the caller's organizations before anything runs.

export async function activate(orderId: string): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId }, () => ordersService.activate(orderId));
}

export async function startMigrated(orderId: string, startDate: string): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId }, () => ordersService.startMigrated(orderId, startDate));
}

export async function changeStartDateAction(orderId: string, startDate: string, force = false): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId }, async () => {
    if (force) await requirePermission({ order: ["write"] });
    await ordersService.changeStartDate(orderId, startDate, { force });
  });
}

export async function changeEatingDaysAction(orderId: string, days: DayOfWeek[]): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId }, () => ordersService.changeEatingDays(orderId, days));
}

// Returns, not throws: production redacts thrown server-action errors, so the refusal message would be lost.
export async function cancel(orderId: string): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId }, async () => {
    await cancelOrderAndOpenPayments(orderId, await currentUserId());
  });
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
  return orderAction({ order: orderId }, async () => ({ quote: await quoteOrderAddons(orderId, selections, methodId) }));
}

// FormData: selections (JSON), method, expected_amount_due (the quote on screen), reference (optional), proof + proof_thumb (images).
export async function addOrderAddonsAction(orderId: string, form: FormData): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId, reach: { payments: true } }, async () => {
    const selections = parseAddonSelections(form.get("selections"));
    const method = form.get("method");
    const methodId = typeof method === "string" ? method : "";
    const shown = form.get("expected_amount_due");
    const expectedAmountDue = typeof shown === "string" && shown.trim() !== "" ? Number(shown) : NaN;
    if (!Number.isFinite(expectedAmountDue) || expectedAmountDue < 0) throw new ValidationError("Add-on amount missing, reopen the dialog");
    // Every rule runs before the screenshot is stored, so a refused save leaves no orphan file.
    const fresh = await quoteOrderAddons(orderId, selections, methodId);
    if (fresh.amountDue.toFixed(2) !== expectedAmountDue.toFixed(2)) {
      throw new ValidationError(`The amount changed to ${formatMoney(fresh.amountDue, (await getAppSettings()).currency)}. Check with the customer and try again.`);
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
}

/** Any staff member marks, re-notes or unmarks an order on the Look out for tab. */
export async function setLookOutAction(orderId: string, on: boolean, note: string): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId, reach: { orderList: true } }, async () =>
    setOrderLookOut(orderId, on, note, await currentUserId()),
  );
}

export async function regenerateAddonLinkAction(orderId: string, paymentPublicId: string): Promise<ActionResult<{ paymentPublicId: string }>> {
  return orderAction({ order: orderId, payment: paymentPublicId, orderPage: orderId }, async () => ({
    paymentPublicId: (await regenerateAddonPayment(paymentPublicId, await currentUserId())).paymentPublicId,
  }));
}

export async function cancelAddonLinkAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  return orderAction({ order: orderId, payment: paymentPublicId, orderPage: orderId }, async () =>
    cancelAddonPayment(paymentPublicId, await currentUserId()),
  );
}

export async function pushDeliveryToOptimoAction(orderId: string, deliveryPublicId: string, date: string): Promise<ActionResult> {
  return orderAction({ delivery: deliveryPublicId, orderPage: orderId }, async () => {
    await pushOneDelivery(deliveryPublicId, date, await currentUserId());
  });
}

/** Manual removal — deletes this one delivery's stop from OptimoRoute regardless of whether
 *  the day-level stale check has caught up to it yet. */
export async function removeDeliveryFromOptimoAction(orderId: string, deliveryPublicId: string, date: string): Promise<ActionResult> {
  return orderAction({ delivery: deliveryPublicId, orderPage: orderId }, async () => {
    await removeOneDelivery(deliveryPublicId, date, await currentUserId());
  });
}

/** Admin-only correction of one delivery's outcome. Customers and members cannot call this. */
export async function setDeliveryStatusAction(
  deliveryPublicId: string,
  status: string,
): Promise<ActionResult> {
  const res = await orderAction({ guard: "admin", delivery: deliveryPublicId }, async () => {
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
      revalidateOrder(order.publicId, { customerApp: true });
    }
  }
  return res;
}

/** Driver could not deliver: moves the whole trip to the next delivery day (merging there); the pool is untouched. */
export async function redeliverTripAction(orderId: string, deliveryPublicId: string): Promise<ActionResult> {
  return orderAction({ delivery: deliveryPublicId, orderPage: orderId }, async () => {
    const { targetDate } = await redeliverTrip(deliveryPublicId, await currentUserId());
    return `Re-delivering on ${targetDate}`;
  });
}

export async function grantComplimentaryAction(
  orderId: string,
  input: { date: string; note: string; notify: boolean; forDeliveryPublicId?: string | null },
): Promise<ActionResult> {
  return orderAction({ guard: "admin", order: orderId, orderPage: orderId }, async () => {
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
}
