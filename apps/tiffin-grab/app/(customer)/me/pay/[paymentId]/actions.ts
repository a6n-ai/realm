"use server";

import { getSession } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { abandonCardAttempt, payByCard, settleStripePayment, type PayByCardResult } from "@/lib/services/payment-stripe";
import { appBaseUrl } from "@/lib/payments/stripe";

export async function submitCardPayment(
  paymentId: string,
  tokenId: string,
  acceptSurcharge: boolean,
): Promise<ActionResult<PayByCardResult>> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) throw new Error("Sign in to pay");
    return payByCard({
      paymentPublicId: paymentId,
      userPublicId: session.user.id,
      confirmationTokenId: tokenId,
      acceptSurcharge,
      returnUrl: `${appBaseUrl()}/me/pay/${paymentId}?return=1`,
    });
  });
}

export async function confirmReturn(paymentId: string): Promise<ActionResult<{ paid: boolean }>> {
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
    return { paid: outcome === "paid" || outcome === "already_paid" };
  });
}

export async function abandonCard(paymentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) throw new Error("Not signed in");
    await abandonCardAttempt(paymentId, session.user.id);
  });
}
