import "server-only";
import { and, eq, gte, inArray, like, lte, sql } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import type Stripe from "stripe";
import { NotFoundError, ValidationError } from "@foundry/commons";
import {
  chargeSavedCard, createAndConfirmIntent, defaultCard, ensureCustomer, fetchIntentStatus,
  listCards, listIntents, previewConfirmationToken, refundIntent, surchargeCents, type CardPreview, type SavedCard,
} from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { ledgerEntries, orderActivities, orders, payments, users } from "@/db/schema";
import { clearStripeCustomer, customerStore, stripeRuntime, toCents, fromCents } from "@/lib/payments/stripe";
import { cardPayClosed } from "@/lib/orders/display-status";
import { resolveProvince } from "@/lib/tax/canada";
import { stripeTaxFor } from "@/lib/tax/checkout-taxes";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import {
  NOTE_AMOUNT_MISMATCH, NOTE_CANCELLED_ORDER, NOTE_CC_NO_SURCHARGE, NOTE_PI_OTHER_PAYMENT,
} from "./stripe-notes";
import { ledgerService } from "./ledger.service";
import { PAY_IN_PROGRESS, withCustomerPayLock } from "./customer-pay-lock";
import { enqueueStaffNotification } from "@/lib/notifications/enqueue";
import { settleAddonPayment } from "./order-addons.service";
import { verifyPayment, refundPaymentInTx, resolveUserId } from "./orders.service";

const log = createLogger("payment-stripe");

function isMissingCustomer(e: unknown): boolean {
  const x = e as { type?: string; code?: string; param?: string; message?: string } | null;
  return x?.type === "StripeInvalidRequestError" && ((x.code === "resource_missing" && x.param === "customer") || /No such customer/i.test(x.message ?? ""));
}

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

/**
 * Detect-only: a credit card confirmed on a PI created at the debit (no-fee) price still settles, but staff
 * see the uncollected fee. Never blocks money; a failed lookup is logged and skipped.
 */
async function flagUnchargedSurcharge(rt: NonNullable<Awaited<ReturnType<typeof stripeRuntime>>>, pay: Payment, piId: string, source: string) {
  try {
    if (toCents(pay.surchargeAmount ?? 0) !== 0) return;
    const pi = await rt.stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    const charge = pi.latest_charge;
    const card = charge && typeof charge !== "string" ? charge.payment_method_details?.card : undefined;
    if (card?.wallet || card?.funding !== "credit") return; // wallets carry no fee by policy
    const [row] = await db
      .select({ order: orders })
      .from(orders)
      .where(eq(orders.id, pay.orderId))
      .limit(1);
    if (!row) return;
    const fee = surchargeCents({ funding: "credit", province: provinceOf(row.order), baseCents: toCents(pay.amount), cfg: rt.cfg.surcharge });
    if (fee <= 0) return;
    await activityOnce(pay.orderId, "payment_failed", NOTE_CC_NO_SURCHARGE, piId, `- uncollected fee ${fromCents(fee)}`);
    log.warn({ paymentId: pay.publicId, piId, source }, "credit card settled without surcharge");
  } catch (e) {
    log.error({ paymentId: pay.publicId, piId, source, err: e }, "surcharge bypass check failed");
  }
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
    await activityOnce(pay.orderId, "payment_failed", NOTE_PI_OTHER_PAYMENT, piId, "belongs to another payment - not settled");
    log.error({ paymentId: pay.publicId, piId, source }, "stripe intent bound to another payment");
    return "amount_mismatch";
  }

  // An add-on payment on a cancelled plan is still recorded (and flagged for refund) by settleAddonPayment.
  const [order] = await db.select({ status: orders.status, publicId: orders.publicId, deploymentId: orders.deploymentId }).from(orders).where(eq(orders.id, pay.orderId)).limit(1);
  if (order?.status === "cancelled" && !pay.addonRequest) {
    await activityOnce(pay.orderId, "payment_failed", NOTE_CANCELLED_ORDER, piId, "- refund it in Stripe");
    await db.transaction((tx) => enqueueStaffNotification(tx, {
      title: "Card payment needs attention",
      body: `Paid on a cancelled order — refund needed · order ${order.deploymentId}`,
      href: `/dashboard/orders/${order.publicId}`,
      dedupeKey: `paid_not_started:${order.publicId}`,
    }));
    log.error({ paymentId: pay.publicId, piId, source }, "stripe payment on cancelled order");
    return "order_cancelled";
  }

  const expected = toCents(pay.amount) + toCents(pay.surchargeAmount ?? 0);
  if (st.amountReceivedCents !== expected || st.currency !== "cad") {
    await activityOnce(
      pay.orderId,
      "payment_failed",
      NOTE_AMOUNT_MISMATCH,
      piId,
      `- received ${fromCents(st.amountReceivedCents)} ${st.currency.toUpperCase()}, expected ${fromCents(expected)} CAD, not settled`,
    );
    log.error({ paymentId: pay.publicId, piId, source }, "stripe amount mismatch");
    return "amount_mismatch";
  }

  await flagUnchargedSurcharge(rt, pay, piId, source);

  // provider_ref follows the PI that actually succeeded (a fast webhook can beat payByCard's write).
  await db
    .update(payments)
    .set({ providerRef: piId, providerEventId: eventId ?? null })
    .where(and(eq(payments.id, pay.id), sql`${payments.providerEventId} is null`));
  // Add-on payments must not go through verifyPayment: it settles whole-order coupons, coins and starts.
  if (pay.addonRequest) {
    return (await settleAddonPayment(pay.publicId, { providerEventId: eventId ?? null })) === "already_paid" ? "already_paid" : "paid";
  }
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

/** What the paid screen prints; server-computed so the card fee and brand are never client-supplied. */
export type CardReceipt = { paidWith: string | null; feeCents: number; totalCents: number };

const WALLETS: Record<string, string> = { apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link" };
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function paidWithLabel(card: { brand: string | null; last4: string | null; wallet?: string | null }): string | null {
  if (card.wallet) return WALLETS[card.wallet] ?? titleCase(card.wallet);
  return card.brand ? (card.last4 ? `${titleCase(card.brand)} •••• ${card.last4}` : titleCase(card.brand)) : null;
}

export type PayByCardResult =
  | { kind: "confirm_surcharge"; surcharge: string; newTotal: string; brand: string | null; last4: string | null }
  | { kind: "succeeded"; receipt?: CardReceipt }
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
  const closed = cardPayClosed(row.order.status, row.pay.expiresAt);
  if (closed) throw new ValidationError(closed);
  return row;
}

/**
 * One charge attempt per payment at a time: tokens differ per submit, so Stripe idempotency alone
 * cannot stop two tabs from creating two PIs. Lock is transaction-scoped, released on any exit.
 * ponytail: each charge holds a pooled connection and needs a second for its queries, so ~pool-size
 * concurrent charges would exhaust the pool; upgrade to a row-claim column (claimed_at) if that matters.
 */
export async function tryChargeLock(tx: Pick<typeof db, "execute">, paymentPublicId: string): Promise<boolean> {
  const got = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${"stripe-charge:" + paymentPublicId}, 0)) as ok`);
  return !!(got as unknown as { ok: boolean }[])[0]?.ok;
}

async function withChargeLock<T>(paymentPublicId: string, busy: T, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (!(await tryChargeLock(tx, paymentPublicId))) return busy;
    return fn();
  });
}

async function bumpAttempt(pay: Payment) {
  await db.update(payments).set({ chargeAttempt: sql`${payments.chargeAttempt} + 1` }).where(eq(payments.id, pay.id));
  pay.chargeAttempt += 1;
}

type Prior = "succeeded" | "processing" | "cleared" | "stuck";

/**
 * Before a new PI exists the previous one must be dead: succeeded/processing block the attempt, any
 * unfinished requires_* PI is cancelled (else its later completion double-charges the customer).
 */
async function clearPrior(stripe: Stripe, pay: Payment): Promise<Prior> {
  if (!pay.providerRef) return "cleared";
  const st = await fetchIntentStatus(stripe, pay.providerRef);
  if (st.status === "succeeded" || st.status === "processing") return st.status;
  if (st.status === "canceled") {
    // A saved-card idempotency key replays a cancelled PI for 24h; a new attempt number forces a fresh charge.
    await bumpAttempt(pay);
    return "cleared";
  }
  if (st.status !== "requires_action" && st.status !== "requires_payment_method" && st.status !== "other") return "cleared";
  try {
    await stripe.paymentIntents.cancel(pay.providerRef);
  } catch (e) {
    const again = await fetchIntentStatus(stripe, pay.providerRef);
    if (again.status === "succeeded" || again.status === "processing") return again.status;
    if (again.status !== "canceled") {
      log.error({ paymentId: pay.publicId, piId: pay.providerRef, err: e }, "could not cancel prior stripe intent");
      return "stuck";
    }
  }
  await bumpAttempt(pay);
  return "cleared";
}

const settled = async (ref: { paymentRef: string; piId?: string | null }, source: "return" | "staff") => {
  const o = await settleStripePayment(ref, source);
  return o === "paid" || o === "already_paid";
};

const provinceOf = (order: Order) => resolveProvince({ postalCode: order.postalCode });

/**
 * Amount charged above payments.amount (fee, plus tax on the fee when surchargeTaxable) and the Stripe
 * tax calculation backing the PI. An expired base calculation is replaced and persisted for later attempts.
 */
async function priceCharge(pay: Payment, order: Order, feeCents: number, surchargeTaxable: boolean): Promise<{ calcId: string | null; extraCents: number }> {
  if (pay.taxSource !== "stripe") return { calcId: null, extraCents: feeCents };
  const snap = order.pricingSnapshot as OrderPricingSnapshot;
  const addon = pay.addonRequest;
  const inBase = feeCents > 0 && surchargeTaxable;
  // An add-on's calc expiry is not stored, so its base is always re-checked (the link lives < 1 day).
  const fresh = !addon && (snap.tax?.expiresAt ?? 0) > Date.now() + 5 * 60_000;
  if (fresh && !inBase) return { calcId: pay.taxCalculationId, extraCents: feeCents };

  // An add-on payment is taxed on the add-on amount alone, never the order's receipt.
  const snapTaxCents = toCents(addon ? addon.taxTotal : (snap.taxTotal ?? 0));
  const preTaxCents = addon ? toCents(addon.addonSubtotal) : toCents(pay.amount) - snapTaxCents;
  const address = { line1: order.addressLine, city: order.city, postalCode: order.postalCode, province: provinceOf(order) };
  const base = await stripeTaxFor({ taxableCents: preTaxCents, reference: pay.publicId, address });
  if (!base) return { calcId: null, extraCents: feeCents }; // Stripe Tax unavailable now: charge without a linked calc
  if (base.taxCents !== snapTaxCents) {
    // Rates changed since quote: never charge a total the customer did not see.
    throw new ValidationError("Tax has changed since your order was priced. Please contact us to reprice it.");
  }
  if (!inBase) {
    if (addon) await db.update(payments).set({ taxCalculationId: base.calculationId }).where(eq(payments.id, pay.id));
    else await persistCalc(pay, order, snap, base.calculationId, base.expiresAt);
    return { calcId: base.calculationId, extraCents: feeCents };
  }
  // The fee calc is for this card only, so it is never persisted for later attempts.
  const withFee = await stripeTaxFor({ taxableCents: preTaxCents + feeCents, reference: pay.publicId, address });
  if (!withFee) return { calcId: null, extraCents: feeCents };
  return { calcId: withFee.calculationId, extraCents: feeCents + (withFee.taxCents - snapTaxCents) };
}

async function persistCalc(pay: Payment, order: Order, snap: OrderPricingSnapshot, calculationId: string, expiresAt: number | null) {
  await db.update(payments).set({ taxCalculationId: calculationId }).where(eq(payments.id, pay.id));
  await db.update(orders).set({ pricingSnapshot: { ...snap, tax: { source: "stripe", calculationId, expiresAt } } }).where(eq(orders.id, order.id));
}

export async function refreshTaxIfExpired(pay: Payment): Promise<Payment> {
  if (pay.taxSource !== "stripe") return pay;
  const [order] = await db.select().from(orders).where(eq(orders.id, pay.orderId)).limit(1);
  if (!order) return pay;
  const { calcId } = await priceCharge(pay, order, 0, false);
  return { ...pay, taxCalculationId: calcId };
}

const clearCard = (payId: bigint) =>
  db.update(payments).set({ surchargeAmount: "0", cardBrand: null, cardLast4: null }).where(eq(payments.id, payId));

/**
 * Drops the card/fee shown on Bills after an attempt the customer abandoned (e.g. failed 3DS).
 * No-op unless the payment is still payable and its PI is neither succeeded nor processing. Never touches amount.
 */
export async function abandonCardAttempt(paymentPublicId: string, userPublicId: string): Promise<void> {
  await loadOwned(paymentPublicId, userPublicId);
  await withChargeLock<void>(paymentPublicId, undefined, async () => {
    const { pay } = await loadOwned(paymentPublicId, userPublicId);
    if (pay.providerRef) {
      const rt = await stripeRuntime();
      if (!rt) return;
      const st = await fetchIntentStatus(rt.stripe, pay.providerRef);
      if (st.status === "succeeded" || st.status === "processing") return;
      try {
        await rt.stripe.paymentIntents.cancel(pay.providerRef);
      } catch (e) {
        // Already canceled is fine; if it actually completed meanwhile, leave the fields for settle.
        const again = await fetchIntentStatus(rt.stripe, pay.providerRef);
        if (again.status === "succeeded" || again.status === "processing") return;
        if (again.status !== "canceled") log.error({ paymentId: pay.publicId, piId: pay.providerRef, err: e }, "could not cancel abandoned intent");
      }
      await bumpAttempt(pay);
    }
    await clearCard(pay.id);
  });
}

export type CardSource = { confirmationTokenId: string } | { savedPaymentMethodId: string };

/** The user's saved cards, default first. Empty when Stripe is off or they have no Stripe customer. */
export async function listSavedCards(userPublicId: string): Promise<SavedCard[]> {
  const rt = await stripeRuntime();
  if (!rt) return [];
  const customerId = await customerStore.get(userPublicId);
  if (!customerId) return [];
  try {
    return await listCards(rt.stripe, customerId);
  } catch (e) {
    if (!isMissingCustomer(e)) throw e;
    await clearStripeCustomer(userPublicId);
    return [];
  }
}

export async function payByCard(i: {
  paymentPublicId: string; userPublicId: string; source: CardSource; acceptSurcharge: boolean; returnUrl: string;
}): Promise<PayByCardResult> {
  await loadOwned(i.paymentPublicId, i.userPublicId);
  return withChargeLock<PayByCardResult>(i.paymentPublicId, { kind: "processing" }, async () => {
    const { pay, order, user } = await loadOwned(i.paymentPublicId, i.userPublicId);
    const rt = await stripeRuntime();
    if (!rt) return { kind: "failed", message: "Card payments are unavailable right now. Please try again shortly." };

    const prior = await clearPrior(rt.stripe, pay);
    if (prior === "succeeded") {
      const receipt = { paidWith: paidWithLabel({ brand: pay.cardBrand, last4: pay.cardLast4 }), feeCents: toCents(pay.surchargeAmount), totalCents: toCents(pay.amount) + toCents(pay.surchargeAmount) };
      return (await settled({ paymentRef: pay.publicId }, "return")) ? { kind: "succeeded", receipt } : { kind: "processing" };
    }
    if (prior === "processing") return { kind: "processing" };
    if (prior === "stuck") return { kind: "failed", message: "A previous card attempt is still open. Please try again in a moment." };

    const saved = "savedPaymentMethodId" in i.source ? i.source.savedPaymentMethodId : null;
    let card: Pick<CardPreview, "funding" | "brand" | "last4" | "wallet">;
    if (saved) {
      // A tampered id must fail as a validation error before any intent exists.
      const own = (await listSavedCards(user.publicId)).find((c) => c.paymentMethodId === saved);
      if (!own) throw new ValidationError("That card is not available. Choose another card.");
      card = { ...own, wallet: null };
    } else {
      card = await previewConfirmationToken(rt.stripe, (i.source as { confirmationTokenId: string }).confirmationTokenId);
    }
    const baseCents = toCents(pay.amount);
    const fee = card.wallet ? 0 : surchargeCents({ funding: card.funding, province: provinceOf(order), baseCents, cfg: rt.cfg.surcharge });
    const { calcId, extraCents } = await priceCharge(pay, order, fee, rt.cfg.tax.surchargeTaxable);
    if (extraCents > 0 && !i.acceptSurcharge) {
      return { kind: "confirm_surcharge", surcharge: fromCents(extraCents), newTotal: fromCents(baseCents + extraCents), brand: card.brand, last4: card.last4 };
    }
    const who = { ref: user.publicId, email: user.email, name: user.name };
    const customerId = await ensureCustomer(rt.stripe, customerStore, who);

    await db.update(payments).set({ surchargeAmount: fromCents(extraCents), cardBrand: card.brand, cardLast4: card.last4 }).where(eq(payments.id, pay.id));
    const createIntent = (cid: string) => createAndConfirmIntent(rt.stripe, {
      amountCents: baseCents + extraCents, customerId: cid, paymentRef: pay.publicId,
      ...(saved ? { paymentMethodId: saved, attempt: String(pay.chargeAttempt) } : { confirmationTokenId: (i.source as { confirmationTokenId: string }).confirmationTokenId }),
      orgRef: order.organizationId, taxCalculationId: calcId, returnUrl: i.returnUrl, description: `Order ${order.publicId}`,
    });
    let r;
    try {
      r = await createIntent(customerId);
    } catch (e) {
      if (!isMissingCustomer(e)) throw e;
      await clearStripeCustomer(user.publicId);
      if (saved) throw new ValidationError("That card is not available. Choose another card.");
      // Stored id is from another Stripe account/mode: drop it and retry once with a fresh customer.
      r = await createIntent(await ensureCustomer(rt.stripe, customerStore, who));
    }
    if (r.piId) await db.update(payments).set({ providerRef: r.piId }).where(eq(payments.id, pay.id));

    if (r.status === "succeeded") {
      const receipt = { paidWith: paidWithLabel(card), feeCents: extraCents, totalCents: baseCents + extraCents };
      return (await settled({ paymentRef: pay.publicId, piId: r.piId }, "return")) ? { kind: "succeeded", receipt } : { kind: "processing" };
    }
    if (r.status === "processing") return { kind: "processing" };
    if (r.status === "requires_action" && r.clientSecret) return { kind: "requires_action", clientSecret: r.clientSecret };
    // Saved-card keys are per attempt; only a definitive decline may open a new one (tokens are unique per submit).
    if (saved && r.status === "failed") await db.update(payments).set({ chargeAttempt: sql`${payments.chargeAttempt} + 1` }).where(eq(payments.id, pay.id));
    await clearCard(pay.id);
    return { kind: "failed", message: r.reason ?? "Your card was declined." };
  });
}

export type SavedCardResult = { kind: "succeeded" | "processing" | "requires_action" | "failed" | "no_card"; message?: string };

const UNSETTLED = "Charged in Stripe but not yet settled in the system; check the order before retrying.";

/** Staff charge shares the customer's lock: a customer checking out at the same time must not end up charged twice. */
export async function chargeSavedCardForPayment(paymentPublicId: string, actorPublicId: string): Promise<SavedCardResult> {
  const { user } = await loadOwned(paymentPublicId, null);
  try {
    return await withCustomerPayLock(user.publicId, () => chargeSavedCardLocked(paymentPublicId, actorPublicId));
  } catch (e) {
    if (e instanceof ValidationError && e.message === PAY_IN_PROGRESS) return { kind: "processing", message: "The customer is paying right now." };
    throw e;
  }
}

async function chargeSavedCardLocked(paymentPublicId: string, actorPublicId: string): Promise<SavedCardResult> {
  await loadOwned(paymentPublicId, null);
  return withChargeLock<SavedCardResult>(paymentPublicId, { kind: "processing", message: "A charge for this payment is already in progress." }, async () => {
    const { pay, order, user } = await loadOwned(paymentPublicId, null);
    const rt = await stripeRuntime();
    if (!rt) return { kind: "failed", message: "Stripe is not connected" };
    const prior = await clearPrior(rt.stripe, pay);
    if (prior === "succeeded") return (await settled({ paymentRef: pay.publicId }, "staff")) ? { kind: "succeeded" } : { kind: "processing", message: UNSETTLED };
    if (prior === "processing") return { kind: "processing" };
    if (prior === "stuck") return { kind: "failed", message: "A previous card attempt is still open and could not be cancelled." };
    const customerId = await customerStore.get(user.publicId);
    let card: Awaited<ReturnType<typeof defaultCard>> = null;
    try {
      card = customerId ? await defaultCard(rt.stripe, customerId) : null;
    } catch (e) {
      if (!isMissingCustomer(e)) throw e;
      await clearStripeCustomer(user.publicId);
      return { kind: "no_card" };
    }
    if (!customerId || !card) return { kind: "no_card" };

    const baseCents = toCents(pay.amount);
    const fee = surchargeCents({ funding: card.funding, province: provinceOf(order), baseCents, cfg: rt.cfg.surcharge });
    const { calcId, extraCents } = await priceCharge(pay, order, fee, rt.cfg.tax.surchargeTaxable);
    await db.update(payments).set({ surchargeAmount: fromCents(extraCents), cardBrand: card.brand, cardLast4: card.last4 }).where(eq(payments.id, pay.id));

    let r;
    try {
      r = await chargeSavedCard(rt.stripe, {
        amountCents: baseCents + extraCents, customerId, paymentMethodId: card.paymentMethodId, paymentRef: pay.publicId,
        orgRef: order.organizationId, taxCalculationId: calcId, attempt: String(pay.chargeAttempt),
      });
    } catch (e) {
      if (!isMissingCustomer(e)) throw e;
      await clearStripeCustomer(user.publicId);
      return { kind: "no_card" };
    }
    if (r.piId) await db.update(payments).set({ providerRef: r.piId }).where(eq(payments.id, pay.id));
    // Only a definitive decline opens a new idempotency key; processing/requires_action must replay the same charge.
    if (r.status === "failed") {
      await db.update(payments).set({ chargeAttempt: sql`${payments.chargeAttempt} + 1` }).where(eq(payments.id, pay.id));
      await clearCard(pay.id);
    }
    await db.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: `Staff charged saved card ${card.brand ?? ""} ••${card.last4 ?? ""}: ${r.status}`,
      createdBy: await resolveUserId(db, actorPublicId),
    });
    if (r.status === "succeeded" && !(await settled({ paymentRef: pay.publicId, piId: r.piId }, "staff"))) return { kind: "processing", message: UNSETTLED };
    return { kind: r.status, message: r.reason };
  });
}

/** What settling a payment does beyond marking it paid. */
export type SettleEffect = "start" | "addons" | "plain";

export type ReconcileRow =
  | { kind: "unpaid_here"; piId: string; paymentRef: string; amount: string; effect: SettleEffect }
  | { kind: "amount_differs"; piId: string; paymentRef: string; stripe: string; ours: string }
  | { kind: "paid_here_not_in_stripe"; paymentRef: string; piId: string | null; amount: string }
  | { kind: "unmatched_charge"; piId: string; amount: string };

const MAX_PI_CHECKS = 50;
/** What the card was charged: the payment amount plus any surcharge. */
export const chargedCents = (p: Pick<Payment, "amount" | "surchargeAmount">) => toCents(p.amount) + toCents(p.surchargeAmount ?? 0);

/** Read-only diff between Stripe and our rows. Staff act on rows; nothing is written here. */
export async function reconcileStripe(range: { from: number; to: number }, cursor?: string): Promise<{ rows: ReconcileRow[]; nextCursor: string | null; truncated: boolean }> {
  const rt = await stripeRuntime();
  if (!rt) throw new ValidationError("Stripe is not connected");
  const page = await listIntents(rt.stripe, { fromSec: Math.floor(range.from / 1000), toSec: Math.floor(range.to / 1000) }, cursor);
  const succeeded = page.items.filter((i) => i.status === "succeeded");
  const ours = await db
    .select()
    .from(payments)
    .where(and(eq(payments.method, "stripe"), gte(payments.createdAt, range.from), lte(payments.createdAt, range.to)))
    .limit(500);
  const byRef = new Map(ours.map((p) => [p.publicId, p]));
  const byPi = new Map(ours.filter((p) => p.providerRef).map((p) => [p.providerRef!, p]));
  const rows: ReconcileRow[] = [];
  const seen = new Set<string>();
  const unpaid: { row: ReconcileRow & { kind: "unpaid_here" }; orderId: bigint; addon: boolean; voided: boolean }[] = [];

  for (const i of succeeded) {
    // A payment created before the range can be charged inside it (late payment), so look outside the range too.
    const p = (i.paymentRef && byRef.get(i.paymentRef)) || byPi.get(i.piId) || (await findStripePayment({ paymentRef: i.paymentRef, piId: i.piId }));
    // A row bound to a different PI must not be settled or compared against this one.
    if (!p || (p.providerRef && p.providerRef !== i.piId)) {
      rows.push({ kind: "unmatched_charge", piId: i.piId, amount: fromCents(i.amountReceivedCents) });
      continue;
    }
    seen.add(p.publicId);
    const expected = chargedCents(p);
    if (i.amountReceivedCents !== expected) {
      rows.push({ kind: "amount_differs", piId: i.piId, paymentRef: p.publicId, stripe: fromCents(i.amountReceivedCents), ours: fromCents(expected) });
    } else if (p.status !== "paid" && p.status !== "refunded") {
      const row: ReconcileRow & { kind: "unpaid_here" } = { kind: "unpaid_here", piId: i.piId, paymentRef: p.publicId, amount: fromCents(expected), effect: "plain" };
      rows.push(row);
      unpaid.push({ row, orderId: p.orderId, addon: p.addonRequest != null, voided: p.expiresAt === 0 });
    }
  }
  if (unpaid.length) {
    const os = await db.select({ id: orders.id, status: orders.status, deploymentId: orders.deploymentId }).from(orders).where(inArray(orders.id, unpaid.map((u) => u.orderId)));
    const byId = new Map(os.map((o) => [o.id, o]));
    for (const u of unpaid) {
      const o = byId.get(u.orderId);
      // Mirrors verifyPayment: a void add-on link is only recorded (refund needed); wc- orders are started by staff.
      u.row.effect = u.voided ? "plain" : u.addon ? "addons" : o?.status === "pending" && !o.deploymentId.startsWith("wc-") ? "start" : "plain";
    }
  }
  // Absence from the range proves nothing, so each paid row not seen is checked by retrieving its own PI.
  // ponytail: first page only, capped at MAX_PI_CHECKS retrieves per run; staff narrow the range to check more.
  let truncated = false;
  if (!cursor) {
    let checked = 0;
    for (const p of ours) {
      if (p.status !== "paid" || seen.has(p.publicId)) continue;
      if (checked++ >= MAX_PI_CHECKS) { truncated = true; break; }
      const live = p.providerRef ? await fetchIntentStatus(rt.stripe, p.providerRef).catch(() => null) : null;
      if (live?.status !== "succeeded") {
        rows.push({ kind: "paid_here_not_in_stripe", paymentRef: p.publicId, piId: p.providerRef, amount: fromCents(chargedCents(p)) });
      }
    }
  }
  return { rows, nextCursor: page.nextCursor, truncated };
}

/** Asks Stripe to refund; the charge.refunded webhook is the only ledger writer. A null actor is the system. */
export async function refundStripePayment(paymentPublicId: string, amount: string | null, reason: string, actorPublicId: string | null): Promise<void> {
  if (!reason.trim()) throw new ValidationError("Add a reason for the refund");
  if (amount != null && !(Number.isFinite(Number(amount)) && Number(amount) > 0)) throw new ValidationError("Enter a refund amount greater than zero");
  const [pay] = await db.select().from(payments).where(and(eq(payments.publicId, paymentPublicId), eq(payments.method, "stripe"))).limit(1);
  if (!pay?.providerRef || pay.status !== "paid") throw new ValidationError("Only a settled card payment can be refunded");
  const rt = await stripeRuntime();
  if (!rt) throw new ValidationError("Stripe is not connected");
  // Stripe is the authority on what is refundable: the ledger lags until the webhook lands.
  const pi = await rt.stripe.paymentIntents.retrieve(pay.providerRef, { expand: ["latest_charge"] });
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") throw new ValidationError("Stripe has no charge to refund for this payment");
  // Our own total caps Stripe's: a charge larger than what we billed is never refundable beyond our amount.
  const remaining = Math.min(chargedCents(pay), charge.amount) - charge.amount_refunded;
  const cents = amount == null ? remaining : toCents(amount);
  if (cents <= 0 || cents > remaining) throw new ValidationError(`Refund must be between 0.01 and ${fromCents(Math.max(remaining, 0))}`);
  await refundIntent(rt.stripe, pay.providerRef, cents, `refund:${pay.publicId}:${cents}:${charge.amount_refunded}`);
  await db.insert(orderActivities).values({
    orderId: pay.orderId,
    type: "note",
    note: `Refund of ${fromCents(cents)} requested in Stripe ${actorPublicId ? "by staff" : "automatically"}: ${reason.trim()} (ledger updates when Stripe confirms)`,
    createdBy: await resolveUserId(db, actorPublicId),
  });
}

const LAZY_SETTLE_STALE_MS = 120_000;

/**
 * Lazy on-view check (no cron): settles awaiting card payments that were not checked
 * in the last two minutes. Call it inside after() so the page response does not wait.
 */
export async function settleStaleOnView(
  rows: readonly { publicId: string; method?: string; status: string; providerRef: string | null; providerCheckedAt: number | null }[],
): Promise<void> {
  const cutoff = Date.now() - LAZY_SETTLE_STALE_MS;
  for (const p of rows) {
    if ((p.method ?? "stripe") !== "stripe" || p.status !== "awaiting_payment" || !p.providerRef) continue;
    if ((p.providerCheckedAt ?? 0) >= cutoff) continue;
    await settleStripePayment({ paymentRef: p.publicId }, "view").catch((e) =>
      log.error({ paymentId: p.publicId, err: (e as Error).message }, "lazy stripe settle failed"),
    );
  }
}
