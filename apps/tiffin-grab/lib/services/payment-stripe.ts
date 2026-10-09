import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import type Stripe from "stripe";
import { NotFoundError, ValidationError } from "@foundry/commons";
import {
  chargeSavedCard, createAndConfirmIntent, defaultCard, ensureCustomer, fetchIntentStatus,
  previewConfirmationToken, surchargeCents,
} from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { ledgerEntries, orderActivities, orders, payments, users } from "@/db/schema";
import { customerStore, stripeRuntime, toCents, fromCents } from "@/lib/payments/stripe";
import { resolveProvince } from "@/lib/tax/canada";
import { stripeTaxFor } from "@/lib/tax/checkout-taxes";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { ledgerService } from "./ledger.service";
import { verifyPayment, refundPaymentInTx, resolveUserId } from "./orders.service";

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

export type PayByCardResult =
  | { kind: "confirm_surcharge"; surcharge: string; newTotal: string; brand: string | null; last4: string | null }
  | { kind: "succeeded" }
  | { kind: "processing" }
  | { kind: "requires_action"; clientSecret: string }
  | { kind: "failed"; message: string };

type Order = typeof orders.$inferSelect;

async function loadOwned(paymentPublicId: string, userPublicId: string | null) {
  const [row] = await db
    .select({ pay: payments, order: orders, user: users })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(payments.publicId, paymentPublicId), eq(payments.method, "stripe")))
    .limit(1);
  if (!row || (userPublicId && row.user.publicId !== userPublicId)) throw new NotFoundError("Payment not found");
  if (row.order.status === "cancelled") throw new ValidationError("This order was cancelled");
  if (row.pay.status !== "awaiting_payment" && row.pay.status !== "rejected") throw new ValidationError("This payment is already settled");
  return row;
}

/**
 * One charge attempt per payment at a time: tokens differ per submit, so Stripe idempotency alone
 * cannot stop two tabs from creating two PIs. Lock is transaction-scoped, released on any exit.
 */
async function withChargeLock<T>(paymentPublicId: string, busy: T, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const got = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${"stripe-charge:" + paymentPublicId}, 0)) as ok`);
    if (!(got as unknown as { ok: boolean }[])[0]?.ok) return busy;
    return fn();
  });
}

/** A PI that already took or is taking money blocks a new attempt (double submit, second tab). */
async function inFlight(stripe: Stripe, pay: Payment): Promise<"succeeded" | "processing" | null> {
  if (!pay.providerRef) return null;
  const st = await fetchIntentStatus(stripe, pay.providerRef);
  return st.status === "succeeded" || st.status === "processing" ? st.status : null;
}

const provinceOf = (order: Order) => resolveProvince({ postalCode: order.postalCode });

/** Expired or surcharge-changed amount means a new calculation (one calc backs one successful PI). */
async function taxCalcFor(pay: Payment, order: Order, chargeCents: number, surchargeTaxable: boolean, hasSurcharge: boolean): Promise<string | null> {
  if (pay.taxSource !== "stripe") return null;
  const snap = order.pricingSnapshot as OrderPricingSnapshot;
  const surchargeInBase = hasSurcharge && surchargeTaxable;
  const fresh = (snap.tax?.expiresAt ?? 0) > Date.now() + 5 * 60_000;
  if (fresh && !surchargeInBase) return pay.taxCalculationId;
  const snapTaxCents = toCents(snap.taxTotal ?? 0);
  const preTaxCents = toCents(pay.amount) - snapTaxCents;
  const taxable = preTaxCents + (surchargeInBase ? chargeCents - toCents(pay.amount) : 0);
  const q = await stripeTaxFor({
    taxableCents: taxable,
    reference: pay.publicId,
    address: { line1: order.addressLine, city: order.city, postalCode: order.postalCode, province: provinceOf(order) },
  });
  if (!q) return null; // Stripe Tax unavailable now: charge without a linked calc
  if (q.taxCents !== snapTaxCents && !surchargeInBase) {
    // Rates changed since quote: never charge a total the customer did not see.
    throw new ValidationError("Tax has changed since your order was priced. Please contact us to reprice it.");
  }
  await db.update(payments).set({ taxCalculationId: q.calculationId }).where(eq(payments.id, pay.id));
  return q.calculationId;
}

export async function refreshTaxIfExpired(pay: Payment): Promise<Payment> {
  if (pay.taxSource !== "stripe") return pay;
  const [order] = await db.select().from(orders).where(eq(orders.id, pay.orderId)).limit(1);
  if (!order) return pay;
  const calcId = await taxCalcFor(pay, order, toCents(pay.amount), false, false);
  return { ...pay, taxCalculationId: calcId };
}

export async function payByCard(i: {
  paymentPublicId: string; userPublicId: string; confirmationTokenId: string; acceptSurcharge: boolean; returnUrl: string;
}): Promise<PayByCardResult> {
  await loadOwned(i.paymentPublicId, i.userPublicId);
  return withChargeLock<PayByCardResult>(i.paymentPublicId, { kind: "processing" }, async () => {
    const { pay, order, user } = await loadOwned(i.paymentPublicId, i.userPublicId);
    const rt = await stripeRuntime();
    if (!rt) return { kind: "failed", message: "Card payments are unavailable right now. Please try again shortly." };

    const busy = await inFlight(rt.stripe, pay);
    if (busy === "succeeded") {
      await settleStripePayment({ paymentRef: pay.publicId }, "return");
      return { kind: "succeeded" };
    }
    if (busy === "processing") return { kind: "processing" };

    const card = await previewConfirmationToken(rt.stripe, i.confirmationTokenId);
    const baseCents = toCents(pay.amount);
    const sCents = surchargeCents({ funding: card.funding, province: provinceOf(order), baseCents, cfg: rt.cfg.surcharge });
    if (sCents > 0 && !i.acceptSurcharge) {
      return { kind: "confirm_surcharge", surcharge: fromCents(sCents), newTotal: fromCents(baseCents + sCents), brand: card.brand, last4: card.last4 };
    }
    const chargeCents = baseCents + sCents;
    const calcId = await taxCalcFor(pay, order, chargeCents, rt.cfg.tax.surchargeTaxable, sCents > 0);
    const customerId = await ensureCustomer(rt.stripe, customerStore, { ref: user.publicId, email: user.email, name: user.name });

    await db.update(payments).set({ surchargeAmount: fromCents(sCents), cardBrand: card.brand, cardLast4: card.last4 }).where(eq(payments.id, pay.id));
    const r = await createAndConfirmIntent(rt.stripe, {
      amountCents: chargeCents, customerId, confirmationTokenId: i.confirmationTokenId, paymentRef: pay.publicId,
      orgRef: order.organizationId, taxCalculationId: calcId, returnUrl: i.returnUrl, description: `Order ${order.publicId}`,
    });
    if (r.piId) await db.update(payments).set({ providerRef: r.piId }).where(eq(payments.id, pay.id));

    if (r.status === "succeeded") {
      await settleStripePayment({ paymentRef: pay.publicId, piId: r.piId }, "return");
      return { kind: "succeeded" };
    }
    if (r.status === "processing") return { kind: "processing" };
    if (r.status === "requires_action" && r.clientSecret) return { kind: "requires_action", clientSecret: r.clientSecret };
    return { kind: "failed", message: r.reason ?? "Your card was declined." };
  });
}

export type SavedCardResult = { kind: "succeeded" | "processing" | "requires_action" | "failed" | "no_card"; message?: string };

export async function chargeSavedCardForPayment(paymentPublicId: string, actorPublicId: string): Promise<SavedCardResult> {
  await loadOwned(paymentPublicId, null);
  return withChargeLock<SavedCardResult>(paymentPublicId, { kind: "processing", message: "A charge for this payment is already in progress." }, async () => {
    const { pay, order, user } = await loadOwned(paymentPublicId, null);
    const rt = await stripeRuntime();
    if (!rt) return { kind: "failed", message: "Stripe is not connected" };
    const busy = await inFlight(rt.stripe, pay);
    if (busy === "succeeded") {
      await settleStripePayment({ paymentRef: pay.publicId }, "staff");
      return { kind: "succeeded" };
    }
    if (busy) return { kind: busy };
    const customerId = await customerStore.get(user.publicId);
    const card = customerId ? await defaultCard(rt.stripe, customerId) : null;
    if (!customerId || !card) return { kind: "no_card" };

    const baseCents = toCents(pay.amount);
    const sCents = surchargeCents({ funding: card.funding, province: provinceOf(order), baseCents, cfg: rt.cfg.surcharge });
    const chargeCents = baseCents + sCents;
    const calcId = await taxCalcFor(pay, order, chargeCents, rt.cfg.tax.surchargeTaxable, sCents > 0);
    await db.update(payments).set({ surchargeAmount: fromCents(sCents), cardBrand: card.brand, cardLast4: card.last4 }).where(eq(payments.id, pay.id));

    const r = await chargeSavedCard(rt.stripe, {
      amountCents: chargeCents, customerId, paymentMethodId: card.paymentMethodId, paymentRef: pay.publicId,
      orgRef: order.organizationId, taxCalculationId: calcId, attempt: String(pay.chargeAttempt),
    });
    if (r.piId) await db.update(payments).set({ providerRef: r.piId }).where(eq(payments.id, pay.id));
    // Only a definitive decline opens a new idempotency key; processing/requires_action must replay the same charge.
    if (r.status === "failed") {
      await db.update(payments).set({ chargeAttempt: sql`${payments.chargeAttempt} + 1` }).where(eq(payments.id, pay.id));
    }
    await db.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: `Staff charged saved card ${card.brand ?? ""} ••${card.last4 ?? ""}: ${r.status}`,
      createdBy: await resolveUserId(db, actorPublicId),
    });
    if (r.status === "succeeded") await settleStripePayment({ paymentRef: pay.publicId, piId: r.piId }, "staff");
    return { kind: r.status, message: r.reason };
  });
}
