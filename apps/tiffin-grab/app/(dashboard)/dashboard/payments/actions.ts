"use server";

import { getSession } from "@/lib/auth/session";
import { rejectPayment, updatePaymentReference, verifyPayment } from "@/lib/payments/verification";
import { currentUserId } from "@/lib/services/session-service";
import { sendPaymentReminder } from "@/lib/services/payment-reminder";
import type { ActionResult } from "@/lib/actions/action-result";
import { orderAction } from "@/lib/actions/order-action";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { publishUserRefresh } from "@/lib/realtime/publish-inbox";

/** Tells the customer's open tabs to refresh after their payment changed. */
async function refreshCustomerOf(orderId: string) {
  const [row] = await db
    .select({ userPublicId: users.publicId })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.publicId, orderId))
    .limit(1);
  if (row) publishUserRefresh(row.userPublicId);
}

export async function verifyPaymentAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  const res = await orderAction(
    { payment: paymentPublicId, orderPage: orderId, reach: { payments: true, wallet: true, dashboard: true, orderList: true } },
    async () => {
      const session = await getSession();
      await verifyPayment(paymentPublicId, { actorId: session?.user?.id ?? null });
    },
  );
  if ("ok" in res) await refreshCustomerOf(orderId);
  return res;
}

export async function rejectPaymentAction(orderId: string, paymentPublicId: string, note: string): Promise<ActionResult> {
  const res = await orderAction(
    { payment: paymentPublicId, orderPage: orderId, reach: { payments: true, wallet: true } },
    async () => rejectPayment(paymentPublicId, note, await currentUserId()),
  );
  if ("ok" in res) await refreshCustomerOf(orderId);
  return res;
}

export async function updatePaymentReferenceAction(orderId: string, paymentPublicId: string, reference: string): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId, reach: { payments: true } }, async () =>
    updatePaymentReference(orderId, paymentPublicId, reference, await currentUserId()),
  );
}

export async function sendPaymentReminderAction(orderId: string, paymentPublicId: string): Promise<ActionResult> {
  return orderAction({ order: orderId, orderPage: orderId }, async () =>
    sendPaymentReminder(orderId, paymentPublicId, await currentUserId()),
  );
}
