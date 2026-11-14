"use server";

import { getSession } from "@/lib/auth/session";
import { ownsPayment, requireCustomer } from "@/lib/account/customer";
import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { abandonCardAttempt, chargedReceipt, payByCard, settleStripePayment, type CardReceipt, type CardSource, type PayByCardResult } from "@/lib/payments/payment-stripe";
import { appBaseUrl } from "@/lib/payments/stripe";
import { customerSessionSecret } from "@/lib/payments/card-checkout-context";
import { withCustomerPayLock } from "@/lib/payments/customer-pay-lock";

export async function submitCardPayment(
  paymentId: string,
  source: CardSource,
  acceptSurcharge: boolean,
): Promise<ActionResult<PayByCardResult>> {
  return runAction(async () => {
    const user = await requireCustomer(new Error("Sign in to pay"));
    return withCustomerPayLock(user.id, () =>
      payByCard({
        paymentPublicId: paymentId,
        userPublicId: user.id,
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
    if (!(await ownsPayment(paymentId, session.user.id))) return { paid: false };
    const outcome = await settleStripePayment({ paymentRef: paymentId }, "return");
    const paid = outcome === "paid" || outcome === "already_paid";
    return paid ? { paid, receipt: (await chargedReceipt(paymentId)) ?? undefined } : { paid };
  });
}

export async function abandonCard(paymentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireCustomer(new Error("Not signed in"));
    await abandonCardAttempt(paymentId, user.id);
  });
}

/** A fresh saved-cards session for the signed-in customer, or null: the card form then simply has no saved list. */
export async function newCustomerSession(): Promise<string | null> {
  const session = await getSession();
  return session?.user ? customerSessionSecret(session.user.id) : null;
}
