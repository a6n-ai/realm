"use server";

import { getSession } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { payByCard, settleStripePayment, type PayByCardResult } from "@/lib/services/payment-stripe";
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

// No ownership check: it only triggers the idempotent settle and returns a boolean.
export async function confirmReturn(paymentId: string): Promise<ActionResult<{ paid: boolean }>> {
  return runAction(async () => {
    const outcome = await settleStripePayment({ paymentRef: paymentId }, "return");
    return { paid: outcome === "paid" || outcome === "already_paid" };
  });
}
