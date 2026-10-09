"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { orders, payments, stripeEvents } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { currentUserId } from "@/lib/services/session-service";
import { sendPaymentReminder } from "@/lib/services/payment-reminder";
import { processStripeEvent } from "@/lib/services/stripe-webhook";
import {
  chargeSavedCardForPayment,
  reconcileStripe,
  refundStripePayment,
  settleStripePayment,
  type ReconcileRow,
  type SettleOutcome,
} from "@/lib/services/payment-stripe";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

const OUTCOME_TEXT: Record<SettleOutcome, string> = {
  paid: "Settled: payment marked paid",
  already_paid: "Already settled",
  not_succeeded: "Stripe has not confirmed this charge yet",
  amount_mismatch: "amount_mismatch: Stripe amount differs from this payment, not settled",
  not_found: "Payment not found",
  unavailable: "Stripe is not connected",
  order_cancelled: "order_cancelled: refund it in Stripe",
};

const revalidate = () => {
  revalidatePath("/dashboard/payments/stripe");
  revalidatePath("/dashboard/orders/[id]", "page");
};

async function settle(paymentId: string, source: "staff" | "reconcile") {
  const outcome = await settleStripePayment({ paymentRef: paymentId }, source);
  revalidate();
  return { outcome, message: OUTCOME_TEXT[outcome], settled: outcome === "paid" || outcome === "already_paid" };
}

export async function checkStatusAction(paymentId: string) {
  return runAction(async () => {
    await requirePermission({ finance: ["read"] });
    return settle(paymentId, "staff");
  });
}

export async function settleFromReconcileAction(paymentRef: string) {
  return runAction(async () => {
    await requirePermission({ finance: ["read"] });
    return settle(paymentRef, "reconcile");
  });
}

export async function refundAction(paymentId: string, amount: string | null, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission({ finance: ["refund"] });
    const session = await getSession();
    await refundStripePayment(paymentId, amount?.trim() ? amount.trim() : null, reason, session!.user.id);
    revalidate();
    return "Refund requested in Stripe. The ledger updates when Stripe confirms.";
  });
}

export async function reprocessEventAction(eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission({ finance: ["read"] });
    const [ev] = await db.select({ processedAt: stripeEvents.processedAt }).from(stripeEvents).where(eq(stripeEvents.eventId, eventId)).limit(1);
    if (!ev) throw new ValidationError("Event not found");
    if (ev.processedAt) throw new ValidationError("This event was already processed. Use Check status on the payment instead.");
    await processStripeEvent(eventId);
    revalidatePath("/dashboard/payments/logs");
    return "Event reprocessed";
  });
}

export async function reconcileAction(from: number, to: number, cursor?: string): Promise<ActionResult<{ rows: ReconcileRow[]; nextCursor: string | null }>> {
  return runAction(async () => {
    await requirePermission({ finance: ["read"] });
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new ValidationError("Pick a valid date range");
    return reconcileStripe({ from, to }, cursor);
  });
}

export async function chargeSavedCardAction(paymentId: string): Promise<ActionResult<{ linkSent?: boolean; kind: string }>> {
  return runAction(async () => {
    await requirePermission({ finance: ["charge"] });
    const r = await chargeSavedCardForPayment(paymentId, (await getSession())!.user.id);
    let linkSent = false;
    let message = r.message;
    if (r.kind === "requires_action" || r.kind === "failed" || r.kind === "no_card") {
      const [row] = await db
        .select({ orderPublicId: orders.publicId })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(eq(payments.publicId, paymentId))
        .limit(1);
      if (row) {
        try {
          await sendPaymentReminder(row.orderPublicId, paymentId, await currentUserId());
          linkSent = true;
        } catch (e) {
          message = `${message ?? ""} (payment link not sent: ${e instanceof Error ? e.message : "unknown error"})`;
        }
      }
      const base = message ?? (r.kind === "no_card" ? "No saved card" : "Card needs the customer");
      message = linkSent ? `${base}. Payment link emailed to the customer.` : base;
    }
    revalidate();
    return { kind: r.kind, linkSent, message: message ?? (r.kind === "succeeded" ? "Charged and settled" : r.kind === "processing" ? "Charge in progress" : "") };
  });
}
