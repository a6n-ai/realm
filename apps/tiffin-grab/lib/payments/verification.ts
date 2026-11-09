import { markPaymentCaptured } from "@/lib/payments/capture";
import { paymentMethodLabel } from "@/lib/payments/method-label";
import { createLogger } from "@foundry/commons/logger";
import { resolveUserId } from "@/lib/services/session-service";
import { isWordpressImport } from "@/lib/orders/wordpress-import";
import { formatMoney, NotFoundError, ValidationError } from "@foundry/commons";
import { trackConversion } from "@/lib/services/tracking";
import { canVerify, findMethod } from "@foundry/payments";
import { commitTax } from "@foundry/payments/stripe";
import { stripeRuntime } from "@/lib/payments/stripe";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { inStatuses, PAID, SETTLEABLE, UNPAID } from "@/lib/payments/status";
import { paymentStatusIn } from "@/lib/payments/status-sql";
import { db, type Tx } from "@/db/client";
import { coupons, deliveryFrequencies, ledgerEntries, orderActivities, orders, payments, plans, users, type PaymentProof } from "@/db/schema";
import { sendMetaOrderSubmitted } from "@/lib/meta/order-submitted";
import { sendMetaPurchaseOnce } from "@/lib/meta/purchase";
import { runInBackground } from "@foundry/cloud/background";
import { type OrderPricingSnapshot } from "@/lib/pricing";
import { round2 } from "@foundry/commons/util/money";
import { couponsService } from "@/lib/services/coupons.service";
import { enqueueNotification, enqueueStaffNotification } from "@/lib/notifications/enqueue";
import { enqueueOrderNotice } from "@/lib/notifications/order-notice";
import { receiptAttachments } from "@/lib/billing/receipt-link";
import { shiftMissedDeliveries } from "@/lib/services/deliveries.service";
import { removeStopsBestEffort, type OptimoSyncedRow } from "@/lib/services/optimoroute/stops";
import { scheduleWrite } from "@/lib/services/schedule-write";
import { upcomingHolidays } from "@/lib/services/holiday-dates";
import { paidStartDate } from "@/lib/orders/paid-start";
import { ledgerService } from "@/lib/services/ledger.service";
import { assertStartable } from "@/lib/services/order-window";
import { appToday } from "@/lib/services/start-date";
import { commitCoinRedemption, settleCoinReservation, recollectLapsedCoins, reverseCoinRedemption, reverseCoinAward, awardOrderCoins } from "@/lib/services/wallet.service";
import { awardReferral, reverseReferral } from "@/lib/services/referrals.service";
import { getAppSettings, getPaymentConfig } from "@/lib/services/app-settings.service";
import { publishPaymentsInbox, publishUserRefresh } from "@/lib/realtime/publish-inbox";
import { utcIso } from "@foundry/commons/util/dates";
import { lockOrder } from "@/lib/services/order-lock";

const log = createLogger("payments.verification");


/** Receipt extras for payment_approved: card fee, taxes (Stripe Tax lines included), the card used and the total charged. */
export function receiptVars(
  pay: Pick<typeof payments.$inferSelect, "method" | "amount" | "cardBrand" | "cardLast4" | "surchargeAmount">,
  taxLines: { name: string; ratePct: number; amount: number }[],
) {
  const isCard = pay.method === "stripe";
  const fee = isCard ? Number(pay.surchargeAmount) : 0;
  const total = isCard ? formatMoney(Number(pay.amount) + fee) : "";
  const brand = pay.cardBrand ? pay.cardBrand.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Card";
  const parts = [
    ...taxLines.map((t) => `${t.name} ${t.ratePct}%: ${formatMoney(t.amount)}`),
    fee > 0 ? `Card fee ${formatMoney(fee)}` : null,
    isCard ? `Total charged ${total}` : null,
  ].filter(Boolean);
  return {
    receiptLines: parts.join(" · "),
    paidWith: isCard && pay.cardLast4 ? `${brand} •••• ${pay.cardLast4}` : paymentMethodLabel(pay.method, "full"),
    cardFee: fee > 0 ? formatMoney(fee) : "",
    totalCharged: total,
  };
}

/** Shared `{{payment.*}}` template variables for the payment_* customer emails. */
export function paymentTemplateVars(
  pay: Pick<typeof payments.$inferSelect, "amount" | "method">,
  orderCode: string,
  customerName: string | null | undefined,
) {
  return {
    amount: formatMoney(Number(pay.amount)),
    orderCode,
    customerName: customerName || "there",
    method: paymentMethodLabel(pay.method, "full"),
  };
}

async function flagPaidNotStarted(tx: Tx, order: typeof orders.$inferSelect, note: string, actorId: bigint | null) {
  await tx.insert(orderActivities).values({ orderId: order.id, type: "note", note, createdBy: actorId });
  await enqueueStaffNotification(tx, {
    organizationId: order.organizationId,
    title: "Card payment needs attention",
    body: `${note} · order ${order.deploymentId}`,
    href: `/dashboard/orders/${order.publicId}`,
    dedupeKey: `paid_not_started:${order.publicId}`,
  });
}

// A pending Stripe order starts when its payment settles. Pending orders reserve no days, so
// the overlap guard runs here with the final dates. A start that can't happen leaves the
// order pending with a note: the money is already in, staff resolve it.
export async function startPaidStripeOrder(tx: Tx, order: typeof orders.$inferSelect, actorId: bigint | null): Promise<{ started: boolean; reason?: string }> {
  await lockOrder(tx, order.id);
  const [current] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id)).for("update").limit(1);
  // Staff cancelled it after settle's outside check: the money is in, nobody else will flag it.
  if (current?.status === "cancelled" || current?.status === "completed") {
    await flagPaidNotStarted(tx, order, `Paid on a ${current.status} order — refund needed`, actorId);
    return { started: false, reason: `order is ${current.status}` };
  }
  if (current?.status !== "pending") return { started: false, reason: `order is ${current?.status ?? "missing"}` };

  const { timezone, cutoffHour } = await getAppSettings();
  const todayBase = appToday(timezone, cutoffHour);
  const closed = new Set((await upcomingHolidays(tx, order.organizationId, utcIso(todayBase))).keys());
  const [plan] = await tx.select({ allowedStartDays: plans.allowedStartDays }).from(plans).where(eq(plans.id, order.planId)).limit(1);
  const startDate = paidStartDate({
    chosen: order.startDate,
    allowedStartDays: plan?.allowedStartDays ?? [],
    trialSendDays: order.trialLength != null ? (order.trialWeekdays ?? []) : null,
    todayBase,
    closed,
  });
  try {
    await assertStartable(tx, { userId: order.userId!, organizationId: order.organizationId, startDate, durationWeeks: order.durationWeeks, excludeOrderId: order.id, holiday: false });
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    await flagPaidNotStarted(tx, order, `Paid, but could not start: ${e.message}`, actorId);
    return { started: false, reason: e.message };
  }
  const [row] = await tx.update(orders).set({ status: "active", startDate, updatedBy: actorId }).where(eq(orders.id, order.id)).returning();
  await tx.insert(orderActivities).values({
    orderId: order.id,
    type: "activated",
    fromStatus: "pending",
    toStatus: "active",
    note: startDate === order.startDate ? null : `Start moved to ${startDate}`,
    createdBy: actorId,
  });
  await scheduleWrite(tx, row!, actorId, { materialize: true });
  return { started: true };
}

// Staff settles a real-method payment: credits the ledger, redeems any deferred
// coupons from the pricing snapshot, awards earn-back coins, and marks paid.
// Accepts awaiting_payment (e.g. cash confirmed without a customer claim) and
// pending_verification (after a claim). Idempotent against already-paid rows.
export async function verifyPayment(
  paymentPublicId: string,
  opts: { actorId?: string | null; providerEventId?: string | null; fromProvider?: boolean } = {},
): Promise<void> {
  let missedStops: OptimoSyncedRow[] = [];
  const settled = await db.transaction(async (tx) => {
    // Locked so a second, concurrent verify waits, then sees "paid" and stops.
    const [pay] = await tx.select().from(payments).where(eq(payments.publicId, paymentPublicId)).for("update").limit(1);
    if (!pay) throw new NotFoundError("Payment not found");
    if (inStatuses(PAID, pay.status)) return null;
    if (pay.method === "stripe" && !opts.fromProvider) throw new ValidationError("Card payments settle automatically");
    // A provider-confirmed charge settles even a staff-rejected row; a manual verify must not.
    if (pay.status !== "awaiting_payment" && pay.status !== "pending_verification" && !(opts.fromProvider && pay.status === "rejected")) {
      throw new ValidationError(`Payment cannot be verified from status ${pay.status}`);
    }

    // Same lock order as cancel and activate (order advisory lock, then the
    // customer), so a verify racing either one waits instead of deadlocking, and
    // reads the order's status only after a concurrent activate has committed.
    await lockOrder(tx, pay.orderId);
    let [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId)).limit(1);
    if (!order?.userId) throw new NotFoundError("Order not found");
    const orderUserId = order.userId;
    await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${orderUserId} FOR UPDATE`);

    const actorInternalId = await resolveUserId(tx, opts.actorId);

    await markPaymentCaptured(tx, pay, { id: order.id, userId: orderUserId, organizationId: order.organizationId }, {
      createdBy: actorInternalId,
      providerEventId: opts.providerEventId ?? null,
    });

    const snap = order.pricingSnapshot as OrderPricingSnapshot;
    const pending = snap.pendingRedemptions ?? [];
    for (const r of pending) {
      const [coupon] = await tx.select().from(coupons).where(eq(coupons.publicId, r.couponPublicId)).limit(1);
      if (!coupon) throw new ValidationError(`Pending coupon ${r.code} no longer exists`);
      const redeemedBy = r.redeemedByPublicId
        ? await resolveUserId(tx, r.redeemedByPublicId)
        : null;
      await couponsService.redeem(tx, {
        coupon,
        userId: orderUserId,
        orderId: order.id,
        redeemedBy,
        amountApplied: r.amount,
        deferredSettlement: true,
        context: { subtotal: snap.subtotal, planType: snap.planType, kind: coupon.kind },
      });
    }

    if (snap.pendingCoinRedemption && snap.pendingCoinRedemption.coins > 0) {
      const settled = await settleCoinReservation(tx, { userId: orderUserId, orderId: order.id });
      if (settled.status === "none") {
        // An order placed before checkout holds existed: nothing was reserved,
        // so debit now exactly as this path always did.
        await commitCoinRedemption(tx, {
          userId: orderUserId,
          coins: snap.pendingCoinRedemption.coins,
          currencyValue: snap.pendingCoinRedemption.amount,
          orderId: order.id,
        });
      } else if (settled.status === "expired") {
        // The hold lapsed before payment was verified, so those coins went back
        // to the wallet. Take them again so they can't fund a second order;
        // never block the verify: the customer's money has arrived. Whatever
        // was already spent is left for staff on the order's activity log.
        const { collected, notCollected } = await recollectLapsedCoins(tx, {
          userId: orderUserId,
          orderId: order.id,
          orderRef: order.publicId,
          coins: settled.coins,
        });
        log.warn({ orderId: order.publicId, coins: settled.coins, collected, notCollected }, "coin hold expired before payment verification");
        await tx.insert(orderActivities).values({
          orderId: order.id,
          type: "payment_verified",
          note:
            notCollected > 0
              ? `Coin hold expired before verification — ${collected} coins taken again, ${notCollected} coins could not be collected (coin discount of ${snap.pendingCoinRedemption.amount} not fully covered)`
              : `Coin hold expired before verification — ${collected} coins taken again`,
          createdBy: actorInternalId,
        });
      }
    }

    if (pending.length || snap.pendingCoinRedemption) {
      const { pendingRedemptions: _drop, pendingCoinRedemption: _dropCoins, ...rest } = snap;
      await tx
        .update(orders)
        .set({ pricingSnapshot: rest, updatedBy: actorInternalId })
        .where(eq(orders.id, order.id));
    }

    // After coupons/coins settle so they apply even when the start fails. WordPress-migrated pending orders are started by staff.
    // A cancelled order is only seen here when staff cancelled it after settle's own check; startPaidStripeOrder flags it.
    if ((order.status === "pending" || order.status === "cancelled") && pay.method === "stripe" && !isWordpressImport(order)) {
      const { started } = await startPaidStripeOrder(tx, order, actorInternalId);
      if (started) [order] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    }

    if (order.status === "active") missedStops = await shiftMissedDeliveries(tx, order.id, actorInternalId);

    const [user] = await tx
      .select({ publicId: users.publicId, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, orderUserId))
      .limit(1);
    const [freq] = await tx.select({ weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);

    await enqueueNotification(tx, {
      event: "payment_approved",
      recipientId: orderUserId,
      title: "Payment confirmed",
      body: `Your payment of ${formatMoney(Number(pay.amount) + (pay.method === "stripe" ? Number(pay.surchargeAmount) : 0))} for order ${order.deploymentId} is confirmed.`,
      href: "/me/wallet?tab=bills",
      data: {
        payment: {
          ...paymentTemplateVars(pay, order.deploymentId, user?.name),
          ...receiptVars(pay, snap.taxLines ?? []),
          startDate: order.startDate,
          durationWeeks: order.durationWeeks,
          deliveryDays: (freq?.weekdays ?? []).join(", "),
          eatingDays: (order.eatingDays ?? []).join(", "),
        },
      },
      dedupeKey: `payment_approved:${pay.publicId}`,
      attachments: receiptAttachments(order),
    });

    // Waitlisted orders earn in activate instead, once they go active.
    if (order.status === "active") {
      await awardReferral(tx, order, "paid");
      await awardOrderCoins(tx, order, "paid");
    }

    // Card payments are recorded by Stripe through the PaymentIntent's calculation; only manual methods commit here.
    const taxCommit =
      pay.taxSource === "stripe" && pay.method !== "stripe" && pay.taxCalculationId
        ? { calc: pay.taxCalculationId, ref: pay.publicId, orderId: order.id }
        : null;
    const purchase = {
      orderRef: order.publicId,
      paymentRef: pay.publicId,
      method: pay.method,
      value: Number(pay.amount),
      user: { email: user?.email ?? null, phone: user?.phone ?? null, fullName: user?.name ?? null, externalId: String(orderUserId) },
      // The buyer declined analytics/ads cookies at checkout: no GA purchase either.
      consent: (order.metaAttribution as { consent?: boolean } | null)?.consent !== false,
    };
    return { userPublicId: user?.publicId ?? null, taxCommit, purchase };
  });
  const userPublicId = settled?.userPublicId ?? null;
  const taxCommit = settled?.taxCommit ?? null;
  await removeStopsBestEffort(missedStops);

  // GA purchase only. Meta Purchase is sendMetaPurchaseOnce: same event id as the card
  // page pixel, stored click ids, and skipped for renewals. This request is a webhook or
  // a staff verify, so it must not attach this browser.
  if (settled?.purchase?.consent) {
    const { purchase } = settled;
    const { currency } = await getAppSettings();
    trackConversion(
      {
        eventName: "Purchase",
        eventId: `purchase:${purchase.paymentRef}`,
        user: purchase.user,
        customData: { value: purchase.value, currency, order_id: purchase.orderRef },
        // Same id as browser gtag so GA4 dedupes; payment_type mirrors Meta's single Purchase.
        transactionId: purchase.paymentRef,
        paymentType: purchase.method,
      },
      { meta: false },
    );
  }

  // Refreshes the customer's wallet/bills views.
  if (userPublicId) publishUserRefresh(userPublicId);

  if (taxCommit) {
    try {
      const rt = await stripeRuntime();
      if (!rt) throw new Error("Stripe not connected");
      await commitTax(rt.stripe, taxCommit.calc, taxCommit.ref);
    } catch (e) {
      log.error({ err: (e as Error).message }, "stripe tax commit failed");
      await db.insert(orderActivities).values({ orderId: taxCommit.orderId, type: "note", note: "Stripe Tax commit failed — retry from Payments → Stripe" });
    }
  }

  // Purchase CAPI after settle commits. Uses stored order attribution — never webhook headers.
  if (settled) runInBackground(() => sendMetaPurchaseOnce(paymentPublicId), "meta purchase");
}

// Minimal refund trigger: tiffin-grab has no refund-processing flow yet (no
// gateway integration, no refund UI) — this is only the trigger point a
// future one calls. Marks the order's settled payment `refunded` and claws
// back the order_activated coins that payment's activation/verification
// awarded, if any. All three award() call sites (createOrder, verifyPayment,
// activate) use the same (eventType, source) pair for a given order, so this
// reverses whichever of them actually fired without needing to know which one.
export async function refundOrder(
  orderPublicId: string,
  opts: { actorId?: string | null } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.publicId, orderPublicId)).limit(1);
    if (!order) throw new NotFoundError(`Order not found: ${orderPublicId}`);

    const [pay] = await tx.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    if (!pay || !inStatuses(PAID, pay.status)) {
      throw new ValidationError(`Order ${orderPublicId} has no settled payment to refund`);
    }

    const actorInternalId = await resolveUserId(tx, opts.actorId);

    await refundPaymentInTx(tx, {
      orderId: order.id,
      orderPublicId: order.publicId,
      userId: order.userId,
      paymentId: pay.id,
      actorInternalId,
      note: "Order refunded",
    });
  });
}

// Clawback runs in the SAME transaction as the payment-status flip: both
// commit or roll back together, so a crash between them can never leave a
// refunded order whose coins were never reversed.
export async function refundPaymentInTx(
  tx: Tx,
  i: { orderId: bigint; orderPublicId: string; userId: bigint | null; paymentId: bigint; actorInternalId: bigint | null; note: string; /** What this refund returned; defaults to the charged amount still unrefunded. */ refundedAmount?: number; /** The Stripe webhook already wrote the ledger refund row(s): it is the only Stripe ledger writer. */ ledgerRecorded?: boolean },
): Promise<void> {
  // Keep this UPDATE before the ledger-sum read: its row lock serializes concurrent refunds of one payment.
  await tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, i.paymentId));
  await tx.insert(orderActivities).values({ orderId: i.orderId, type: "payment_refunded", note: i.note, createdBy: i.actorInternalId });
  const [{ already }] = await tx
    .select({ already: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.paymentId, i.paymentId), eq(ledgerEntries.type, "refund")));
  const [{ amount, surcharge, paymentRef }] = await tx.select({ amount: payments.amount, surcharge: payments.surchargeAmount, paymentRef: payments.publicId }).from(payments).where(eq(payments.id, i.paymentId));
  // Charged basis (amount + surcharge), the same one Stripe's refund rows use.
  const charged = round2(Number(amount) + Number(surcharge));
  const remainder = round2(charged - Number(already));
  if (!i.ledgerRecorded && i.userId && remainder > 0) {
    await ledgerService.record(tx, { userId: i.userId, orderId: i.orderId, paymentId: i.paymentId, direction: "debit", type: "refund", amount: remainder, memo: i.note });
  }
  const refunded = formatMoney(i.refundedAmount ?? (remainder > 0 ? remainder : charged));
  await enqueueOrderNotice(tx, i.orderId, {
    event: "refund_issued",
    title: "Your refund was issued",
    body: `We refunded ${refunded} for order {code}.`,
    href: "/me/wallet?tab=bills",
    dedupeKey: `refund_issued:${paymentRef}`,
    vars: (o) => ({ payment: { amount: refunded, orderCode: o.code, customerName: o.customerName } }),
  });
  // An add-on payment refund leaves the plan payment paid: the order's rewards stay.
  const [paid] = await tx.select({ addon: payments.addonRequest }).from(payments).where(eq(payments.id, i.paymentId)).limit(1);
  if (paid?.addon) return;
  if (i.userId) {
    await reverseCoinAward(tx, { userId: i.userId, eventType: "order_activated", source: { type: "order", id: i.orderPublicId } });
    // Money back means coins back: a refunded order's spent coins return too.
    await reverseCoinRedemption(tx, { userId: i.userId, orderId: i.orderId });
  }
  await couponsService.releaseForOrder(tx, i.orderId);
  await reverseReferral(tx, { id: i.orderId });
}

// Customer (or staff-on-behalf) marks a manual payment as sent. Requires a transfer
// reference and/or a proof image; requireProof on the method config forces the photo.
// awaiting_payment | rejected → pending_verification. A pending claim is locked.
// Callers MUST authorize (assertCanManageOrder) before invoking — kept out of this
// function to avoid an orders ↔ customer-deliveries import cycle.
export async function claimPayment(
  paymentPublicId: string,
  input: { reference?: string | null; proof?: PaymentProof | null },
  actorId: bigint | null = null,
): Promise<void> {
  const [pay] = await db.select().from(payments).where(eq(payments.publicId, paymentPublicId)).limit(1);
  if (!pay) throw new NotFoundError("Payment not found");
  if (pay.method === "stripe") throw new ValidationError("Card payments are settled automatically");

  // Once claimed the payment is in staff hands: no re-submit until they approve or reject it.
  if (!inStatuses(UNPAID, pay.status)) {
    throw new ValidationError(`Payment cannot be claimed from status ${pay.status}`);
  }

  const cfg = await getPaymentConfig();
  const method = findMethod(cfg, pay.method);
  const requireProof = method?.requireProof === true;

  const reference = input.reference?.trim() || null;
  const proof = input.proof ?? null;
  if (requireProof && !proof) {
    throw new ValidationError("A payment screenshot is required for this method");
  }
  if (!reference && !proof) {
    throw new ValidationError("Add a payment reference or upload a screenshot");
  }

  const claimedAt = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        reference,
        proof,
        claimedAt,
        status: "pending_verification",
        // Clear a prior reject note when re-claiming.
        note: null,
      })
      .where(eq(payments.id, pay.id));

    // Re-claiming after a rejection wipes payments.note, so the rejection reason survives
    // only here. Without this row a rejected-then-reclaimed payment has no history at all.
    await tx.insert(orderActivities).values({
      orderId: pay.orderId,
      type: "payment_claimed",
      note: [
        pay.method,
        reference ? `ref ${reference}` : null,
        proof ? "proof attached" : null,
      ].filter(Boolean).join(" · "),
      createdBy: actorId,
    });

    const [order] = await tx
      .select({ publicId: orders.publicId, deploymentId: orders.deploymentId, userId: orders.userId, customerName: users.name })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.id, pay.orderId))
      .limit(1);

    if (order?.userId) {
      await enqueueNotification(tx, {
        event: "payment_received",
        recipientId: order.userId,
        title: "Payment received",
        body: `We received your payment details for ${formatMoney(Number(pay.amount))}. We'll confirm once it's verified.`,
        href: "/me/wallet?tab=bills",
        data: { payment: paymentTemplateVars(pay, order.deploymentId, order.customerName) },
        dedupeKey: `payment_received:${pay.publicId}:${claimedAt}`,
      });
    }

    if (pay.method === "etransfer") {
      await enqueueStaffNotification(tx, {
        organizationId: pay.organizationId,
        // No event on purpose: in-app rows for an event render from an admin-authored DB
        // template and are skipped when none exists. Without one the payload copy is used.
        title: "New e-Transfer request",
        body: `${pay.amount} awaiting approval${order ? ` · order ${order.publicId}` : ""}`,
        href: "/dashboard/payments/requests",
        dedupeKey: `etransfer_requested:${pay.publicId}:${claimedAt}`,
      });
    }
  });

  // Staff review queue + sidebar dot via payments:inbox SSE.
  publishPaymentsInbox();

  // Funnel only: offline claim is not a Purchase. Purchase CAPI waits for verifyPayment.
  await sendMetaOrderSubmitted(paymentPublicId);
}

// Staff rejects a submitted claim. pending_verification → rejected with a note;
// customer may re-claim. Auth lives at the action layer (requireStaff).
export async function rejectPayment(
  paymentPublicId: string,
  note: string,
  actorId: bigint | null = null,
): Promise<void> {
  const reason = note.trim();
  if (!reason) throw new ValidationError("Add a reason for rejecting this payment");

  const [pay] = await db.select().from(payments).where(eq(payments.publicId, paymentPublicId)).limit(1);
  if (!pay) throw new NotFoundError("Payment not found");
  if (pay.status !== "pending_verification" || !canVerify(pay.status)) {
    throw new ValidationError(`Payment cannot be rejected from status ${pay.status}`);
  }

  await db
    .update(payments)
    .set({
      status: "rejected",
      note: reason,
    })
    .where(eq(payments.id, pay.id));

  await db.insert(orderActivities).values({
    orderId: pay.orderId,
    type: "payment_rejected",
    note: reason,
    createdBy: actorId,
  });
}

/** Staff fix a mistyped or missing transfer reference on one of this order's payments.
 * Logged as an order note: a dedicated activity type would need an enum migration. */
export async function updatePaymentReference(
  orderPublicId: string,
  paymentPublicId: string,
  reference: string,
  actorId: bigint | null = null,
): Promise<void> {
  const next = reference.trim() || null;
  if (next && next.length > 120) throw new ValidationError("Keep the reference under 120 characters");
  const [pay] = await db
    .select({ id: payments.id, orderId: payments.orderId, reference: payments.reference })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.publicId, paymentPublicId), eq(orders.publicId, orderPublicId)))
    .limit(1);
  if (!pay) throw new NotFoundError("Payment not found");
  if (pay.reference === next) return;

  await db.update(payments).set({ reference: next }).where(eq(payments.id, pay.id));
  const change = !pay.reference ? `set to ${next}` : next ? `changed from ${pay.reference} to ${next}` : `cleared (was ${pay.reference})`;
  await db.insert(orderActivities).values({
    orderId: pay.orderId,
    type: "note",
    note: `Payment ${paymentPublicId} reference ${change}`,
    createdBy: actorId,
  });
}

// Serializable claim form context for activate / Finances UI.
export type ClaimPaymentContext = {
  paymentPublicId: string;
  orderPublicId: string;
  deploymentId: string;
  amount: string;
  status: (typeof payments.status.enumValues)[number];
  methodId: string;
  methodLabel: string;
  payeeHandle: string | null;
  instructions: string | null;
  requireProof: boolean;
  rejectNote: string | null;
  // Human-friendly memo the customer should include in the transfer.
  referenceHint: string;
};

export async function getClaimPaymentContext(paymentPublicId: string): Promise<ClaimPaymentContext | null> {
  const [pay] = await db.select().from(payments).where(eq(payments.publicId, paymentPublicId)).limit(1);
  if (!pay) return null;
  const [order] = await db
    .select({ publicId: orders.publicId, deploymentId: orders.deploymentId })
    .from(orders)
    .where(eq(orders.id, pay.orderId))
    .limit(1);
  if (!order) return null;

  const cfg = await getPaymentConfig();
  const method = findMethod(cfg, pay.method);
  return {
    paymentPublicId: pay.publicId,
    orderPublicId: order.publicId,
    deploymentId: order.deploymentId,
    amount: pay.amount,
    status: pay.status,
    methodId: pay.method,
    methodLabel: method?.label ?? pay.method,
    payeeHandle: method?.payeeHandle ?? null,
    instructions: method?.instructions ?? null,
    requireProof: method?.requireProof === true,
    rejectNote: pay.status === "rejected" ? (pay.note ?? null) : null,
    referenceHint: order.deploymentId,
  };
}

/** Claim form for a locked (payment-review) plan on /me/deliveries. */
export async function getClaimPaymentContextForOrder(orderPublicId: string): Promise<ClaimPaymentContext | null> {
  const [pay] = await db
    .select({ publicId: payments.publicId })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(orders.publicId, orderPublicId),
        isNull(payments.addonRequest),
        paymentStatusIn(SETTLEABLE),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!pay) return null;
  return getClaimPaymentContext(pay.publicId);
}
