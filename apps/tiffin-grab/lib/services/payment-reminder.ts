import { and, eq } from "drizzle-orm";
import { NotFoundError, ValidationError, formatMoney } from "@foundry/commons";
import { findMethod } from "@foundry/payments";
import { db } from "@/db/client";
import { orderActivities, orders, payments, users } from "@/db/schema";
import { sendPaymentReminderLink } from "@/lib/auth/invite-links";
import { paymentTemplateVars } from "./orders.service";
import { getPaymentConfig } from "./app-settings.service";

type MethodConfig = { payeeHandle?: string | null; instructions?: string | null; requireProof?: boolean };

/**
 * Method-specific `{{payment.instructions}}` / `{{payment.action}}` so one
 * template reads right for e-Transfer (send, then upload the screenshot) and
 * for methods like cash (the admin's own instructions, no screenshot ask).
 */
export function reminderInstructions(
  pay: { method: string; amount: string },
  orderRef: string,
  method: MethodConfig | null,
): { instructions: string; action: string } {
  const amount = formatMoney(Number(pay.amount));
  if (pay.method === "etransfer") {
    const to = method?.payeeHandle ? ` to ${method.payeeHandle}` : "";
    return {
      instructions: `Send an Interac e-Transfer of ${amount}${to} with ${orderRef} in the message, then upload a screenshot of the transfer.`,
      action: "Upload payment screenshot",
    };
  }
  const custom = method?.instructions?.trim();
  return {
    instructions: custom || `Please complete your payment of ${amount} for order ${orderRef}.`,
    action: method?.requireProof ? "Upload payment proof" : "View my bill",
  };
}

/**
 * Staff-triggered only (never scheduled): emails the customer a single-use
 * sign-in link to Finances → Bills, where they upload the payment screenshot.
 * Callers MUST authorize (requireStaff) first.
 */
export async function sendPaymentReminder(
  orderPublicId: string,
  paymentPublicId: string,
  actorId: bigint | null,
): Promise<void> {
  const [row] = await db
    .select({ pay: payments, orderId: orders.id, orderRef: orders.deploymentId, email: users.email, name: users.name })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(payments.publicId, paymentPublicId), eq(orders.publicId, orderPublicId)))
    .limit(1);
  if (!row) throw new NotFoundError("Payment not found");
  if (row.pay.status !== "awaiting_payment" && row.pay.status !== "rejected") {
    throw new ValidationError("Only an unpaid or rejected payment can be reminded");
  }
  if (!row.email) throw new ValidationError("Customer has no email address");

  const method = findMethod(await getPaymentConfig(), row.pay.method) as MethodConfig | undefined;
  await sendPaymentReminderLink(row.email, {
    ...paymentTemplateVars(row.pay, row.orderRef, row.name),
    ...reminderInstructions(row.pay, row.orderRef, method ?? null),
  });

  await db.insert(orderActivities).values({
    orderId: row.orderId,
    type: "note",
    note: `Payment reminder emailed to ${row.email}`,
    createdBy: actorId,
  });
}
