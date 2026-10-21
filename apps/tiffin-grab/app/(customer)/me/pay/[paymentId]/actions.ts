"use server";

import { getSession } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { abandonCardAttempt, chargedReceipt, payByCard, settleStripePayment, type CardReceipt, type CardSource, type PayByCardResult } from "@/lib/services/payment-stripe";
import { appBaseUrl } from "@/lib/payments/stripe";
import { customerSessionSecret } from "@/lib/payments/card-checkout-context";
import { withCustomerPayLock } from "@/lib/services/customer-pay-lock";

export async function submitCardPayment(
  paymentId: string,
  source: CardSource,
  acceptSurcharge: boolean,
): Promise<ActionResult<PayByCardResult>> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) throw new Error("Sign in to pay");
    return withCustomerPayLock(session.user.id, () =>
      payByCard({
        paymentPublicId: paymentId,
        userPublicId: session.user.id,
        source,
        acceptSurcharge,
        returnUrl: `${appBaseUrl()}/me/pay/${paymentId}?return=1`,
      }),
    );
  });
}

export async function confirmReturn(paymentId: string): Promise<ActionResult<{ paid: boolean; receipt?: CardReceipt }>> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) return { paid: false };
    const [owned] = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(eq(payments.publicId, paymentId), eq(users.publicId, session.user.id)))
      .limit(1);
    if (!owned) return { paid: false };
    const outcome = await settleStripePayment({ paymentRef: paymentId }, "return");
    const paid = outcome === "paid" || outcome === "already_paid";
    return paid ? { paid, receipt: (await chargedReceipt(paymentId)) ?? undefined } : { paid };
  });
}

export async function abandonCard(paymentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) throw new Error("Not signed in");
    await abandonCardAttempt(paymentId, session.user.id);
  });
}

/** A fresh saved-cards session for the signed-in customer, or null: the card form then simply has no saved list. */
export async function newCustomerSession(): Promise<string | null> {
  const session = await getSession();
  return session?.user ? customerSessionSecret(session.user.id) : null;
}
