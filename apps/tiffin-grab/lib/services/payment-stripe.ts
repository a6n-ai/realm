import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { fetchIntentStatus } from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { ledgerEntries, orderActivities, orders, payments } from "@/db/schema";
import { stripeRuntime, toCents, fromCents } from "@/lib/payments/stripe";
import { ledgerService } from "./ledger.service";
import { verifyPayment, refundPaymentInTx } from "./orders.service";

const log = createLogger("payment-stripe");

export type SettleOutcome = "paid" | "already_paid" | "not_succeeded" | "amount_mismatch" | "not_found" | "unavailable" | "order_cancelled";
type Payment = typeof payments.$inferSelect;

export async function findStripePayment(ref: { paymentRef?: string | null; piId?: string | null }): Promise<Payment | null> {
  if (ref.paymentRef) {
    const [p] = await db.select().from(payments).where(and(eq(payments.publicId, ref.paymentRef), eq(payments.method, "stripe"))).limit(1);
    if (p) return p;
  }
  if (ref.piId) {
    const [p] = await db.select().from(payments).where(and(eq(payments.providerRef, ref.piId), eq(payments.method, "stripe"))).limit(1);
    if (p) return p;
  }
  return null;
}

async function activity(orderId: bigint, type: "payment_failed" | "payment_disputed", note: string) {
  await db.insert(orderActivities).values({ orderId, type, note });
}

// Retries/polls re-hit the same bad PI; one activity per (order, type, PI).
async function activityOnce(orderId: bigint, type: "payment_failed", prefix: string, piId: string, detail: string) {
  const note = `${prefix} ${piId} ${detail}`;
  const [dup] = await db
    .select({ id: orderActivities.id })
    .from(orderActivities)
    .where(and(eq(orderActivities.orderId, orderId), eq(orderActivities.type, type), like(orderActivities.note, `${prefix} ${piId} %`)))
    .limit(1);
  if (!dup) await activity(orderId, type, note);
}

const SETTLEABLE = ["awaiting_payment", "pending_verification", "rejected"];

export async function settleStripePayment(
  ref: { paymentRef?: string | null; piId?: string | null },
  source: "webhook" | "return" | "view" | "staff" | "reconcile",
  eventId?: string,
): Promise<SettleOutcome> {
  const pay = await findStripePayment(ref);
  if (!pay) return "not_found";
  if (!SETTLEABLE.includes(pay.status)) return "already_paid";
  const piId = ref.piId ?? pay.providerRef;
  if (!piId) return "not_succeeded";
  const rt = await stripeRuntime();
  if (!rt) return "unavailable";

  const st = await fetchIntentStatus(rt.stripe, piId);
  await db.update(payments).set({ providerCheckedAt: Date.now() }).where(eq(payments.id, pay.id));
  if (st.status !== "succeeded") return "not_succeeded";

  if (st.paymentRef !== pay.publicId) {
    await activityOnce(pay.orderId, "payment_failed", "Stripe PaymentIntent", piId, "belongs to another payment - not settled");
    log.error({ paymentId: pay.publicId, piId, source }, "stripe intent bound to another payment");
    return "amount_mismatch";
  }

  const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, pay.orderId)).limit(1);
  if (order?.status === "cancelled") {
    await activityOnce(pay.orderId, "payment_failed", "Cancelled-order card payment", piId, "- refund it in Stripe");
    log.error({ paymentId: pay.publicId, piId, source }, "stripe payment on cancelled order");
    return "order_cancelled";
  }

  const expected = toCents(pay.amount) + toCents(pay.surchargeAmount ?? 0);
  if (st.amountReceivedCents !== expected || st.currency !== "cad") {
    await activityOnce(
      pay.orderId,
      "payment_failed",
      "Stripe amount mismatch for",
      piId,
      `- received ${fromCents(st.amountReceivedCents)} ${st.currency.toUpperCase()}, expected ${fromCents(expected)} CAD, not settled`,
    );
    log.error({ paymentId: pay.publicId, piId, source }, "stripe amount mismatch");
    return "amount_mismatch";
  }

  // provider_ref follows the PI that actually succeeded (a fast webhook can beat payByCard's write).
  await db
    .update(payments)
    .set({ providerRef: piId, providerEventId: eventId ?? null })
    .where(and(eq(payments.id, pay.id), sql`${payments.providerEventId} is null`));
  await verifyPayment(pay.publicId, { actorId: null, providerEventId: eventId ?? null, fromProvider: true });
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
    const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, pay.orderId)).limit(1);
    if (o?.status === "cancelled") {
      const tag = `[${n.eventId}]`;
      const [dup] = await db
        .select({ id: orderActivities.id })
        .from(orderActivities)
        .where(and(eq(orderActivities.orderId, pay.orderId), eq(orderActivities.type, "payment_refunded"), like(orderActivities.note, `%${tag}`)))
        .limit(1);
      if (!dup) {
        await db.insert(orderActivities).values({ orderId: pay.orderId, type: "payment_refunded", note: `Refund recorded for cancelled order (payment was never settled) ${tag}` });
      }
      return;
    }
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
