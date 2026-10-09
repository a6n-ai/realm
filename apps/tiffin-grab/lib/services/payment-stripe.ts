import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { fetchIntentStatus } from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { ledgerEntries, orderActivities, orders, payments } from "@/db/schema";
import { stripeRuntime, toCents, fromCents } from "@/lib/payments/stripe";
import { ledgerService } from "./ledger.service";
import { verifyPayment, refundPaymentInTx } from "./orders.service";

const log = createLogger("payment-stripe");

export type SettleOutcome = "paid" | "already_paid" | "not_succeeded" | "amount_mismatch" | "not_found" | "unavailable";
type Payment = typeof payments.$inferSelect;

export async function findStripePayment(ref: { paymentRef?: string | null; piId?: string | null }): Promise<Payment | null> {
  if (ref.paymentRef) {
    const [p] = await db.select().from(payments).where(and(eq(payments.publicId, ref.paymentRef), eq(payments.method, "stripe"))).limit(1);
    if (p) return p;
  }
  if (ref.piId) {
    const [p] = await db.select().from(payments).where(eq(payments.providerRef, ref.piId)).limit(1);
    if (p) return p;
  }
  return null;
}

async function activity(orderId: bigint, type: "payment_failed" | "payment_disputed", note: string) {
  await db.insert(orderActivities).values({ orderId, type, note });
}

export async function settleStripePayment(
  ref: { paymentRef?: string | null; piId?: string | null },
  source: "webhook" | "return" | "view" | "staff" | "reconcile",
  eventId?: string,
): Promise<SettleOutcome> {
  const pay = await findStripePayment(ref);
  if (!pay) return "not_found";
  if (pay.status === "paid") return "already_paid";
  const piId = ref.piId ?? pay.providerRef;
  if (!piId) return "not_succeeded";
  const rt = await stripeRuntime();
  if (!rt) return "unavailable";

  const st = await fetchIntentStatus(rt.stripe, piId);
  await db.update(payments).set({ providerCheckedAt: Date.now() }).where(eq(payments.id, pay.id));
  if (st.status !== "succeeded") return "not_succeeded";

  const expected = toCents(pay.amount) + toCents(pay.surchargeAmount ?? 0);
  if (st.amountReceivedCents !== expected || st.currency !== "cad") {
    await activity(
      pay.orderId,
      "payment_failed",
      `Stripe amount mismatch: received ${fromCents(st.amountReceivedCents)} ${st.currency.toUpperCase()}, expected ${fromCents(expected)} CAD (${piId}) - not settled`,
    );
    log.error({ paymentId: pay.publicId, piId, source }, "stripe amount mismatch");
    return "amount_mismatch";
  }

  // provider_ref follows the PI that actually succeeded (a fast webhook can beat payByCard's write).
  await db
    .update(payments)
    .set({ providerRef: piId, providerEventId: eventId ?? null })
    .where(and(eq(payments.id, pay.id), sql`${payments.providerEventId} is null`));
  await verifyPayment(pay.publicId, { actorId: null, providerEventId: eventId ?? null });
  return "paid";
}

export async function recordStripeFailure(n: { piId: string; paymentRef: string | null; reason: string }) {
  const pay = await findStripePayment(n);
  if (!pay || pay.status === "paid") return;
  await activity(pay.orderId, "payment_failed", `Card payment failed: ${n.reason}`);
}

export async function recordStripeRefund(n: { piId: string; eventId: string; amountRefundedCents: number; fullyRefunded: boolean }) {
  const pay = await findStripePayment({ piId: n.piId });
  if (!pay) return;
  if (pay.status !== "paid" && pay.status !== "refunded") {
    throw new Error(`Refund for ${n.piId} arrived but payment ${pay.publicId} is not settled yet`);
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(payments).where(eq(payments.id, pay.id)).for("update");
    const [{ already }] = await tx
      .select({ already: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.paymentId, pay.id), eq(ledgerEntries.type, "refund")));
    const deltaCents = n.amountRefundedCents - toCents(already);
    if (deltaCents <= 0) return;
    const [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId));
    await ledgerService.record(tx, {
      userId: order!.userId!,
      orderId: order!.id,
      paymentId: pay.id,
      direction: "debit",
      type: "refund",
      amount: fromCents(deltaCents),
      memo: `Stripe refund (${n.piId})`,
      providerEventId: n.eventId,
    });
    if (n.fullyRefunded && locked!.status !== "refunded") {
      await refundPaymentInTx(tx, {
        orderId: order!.id,
        orderPublicId: order!.publicId,
        userId: order!.userId,
        paymentId: pay.id,
        actorInternalId: null,
        note: `Refunded in Stripe (${fromCents(n.amountRefundedCents)})`,
      });
    } else {
      await tx.insert(orderActivities).values({ orderId: order!.id, type: "payment_refunded", note: `Partial Stripe refund ${fromCents(deltaCents)}` });
    }
  });
}

export async function recordStripeDispute(n: { piId: string; disputeId: string; amountCents: number; reason: string }) {
  const pay = await findStripePayment({ piId: n.piId });
  if (!pay) return;
  await activity(
    pay.orderId,
    "payment_disputed",
    `Card dispute ${n.disputeId}: ${n.reason}, ${fromCents(n.amountCents)} - respond in Stripe; Stripe does not reverse tax on disputes`,
  );
  // ponytail: no staff-alert channel yet; dispute shows in Payments → Stripe "Disputed" facet
}
