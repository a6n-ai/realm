import { and, eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { orderActivities, orders, payments, users } from "@/db/schema";
import { sendPaymentReminderLink } from "@/lib/auth/invite-links";
import { paymentTemplateVars } from "./orders.service";

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

  await sendPaymentReminderLink(row.email, paymentTemplateVars(row.pay, row.orderRef, row.name));

  await db.insert(orderActivities).values({
    orderId: row.orderId,
    type: "note",
    note: `Payment reminder emailed to ${row.email}`,
    createdBy: actorId,
  });
}
