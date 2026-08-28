import { generateCode, NotFoundError, ValidationError, phoneSchema, emailSchema, parseIsoDateUtc } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
import type { Condition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { BaseRepository, UpdatableRepository, conditionToSql, columnResolver } from "@realm/database";
import { canClaim, canVerify, enabledMethods, findMethod } from "@realm/payments";
import { resolveVisibleOrgIds } from "@realm/auth";
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  coupons,
  deliveries,
  deliveryFrequencies,
  member,
  mealSizes,
  orderActivities,
  orders,
  organization,
  payments,
  plans,
  subscriptionPauses,
  users,
  type PaymentProof,
} from "@/db/schema";
import { SessionBaseService, SessionUpdatableService, recordAudit } from "./session-service";
import type { SortState } from "@/lib/list/sort";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type OrderPricingSnapshot, type PricingLine, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { couponsService } from "./coupons.service";
import { cancelDeliveries, materializeDeliveries, pauseRange, resumeOrder as resumeOrderDeliveries } from "./deliveries.service";
import { ledgerService } from "./ledger.service";
import { reservedEndDatesExclusive } from "./order-window";
import { provisionCustomerByPhone } from "./customers.service";
import { assertPauseAllowed } from "./pause-limits.service";
import { validateStartDate } from "./start-date";
import { walletService, lockAndQuoteCoinRedemption, commitCoinRedemption, reverseCoinAward } from "./wallet.service";
import { assertReassignAllowed, resolveAssignableOwner } from "./reassign";
import { getAppSettings, getPaymentConfig } from "./app-settings.service";

const log = createLogger("orders.service");

// True when a Postgres unique-violation (23505) hit the one-open-pause partial
// index. drizzle wraps the driver error, so the real PostgresError (with code +
// constraint_name) sits on .cause; postgres.js names the field constraint_name.
function isOpenPauseConflict(e: unknown): boolean {
  type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr };
  const err = e as PgErr;
  const layers = [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
  return layers.some(
    (l) => l.code === "23505" && (l.constraint ?? l.constraint_name ?? "").includes("subscription_pauses_one_open_uniq"),
  );
}

// A transaction handle (or the base db) — payments + their ledger credit are
// written inside the same tx as the order they settle.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentStatusValue = (typeof payments.status.enumValues)[number];
type PaymentMethodValue = (typeof payments.method.enumValues)[number];

// tx-aware payment recording: writes the payments row, and (unless creditLedger is
// false) a matching ledger credit. Real-method checkouts defer the credit until
// staff verify — they pass creditLedger: false and status: awaiting_payment.
export async function recordPayment(
  tx: Tx,
  input: {
    orderId: bigint;
    userId: bigint;
    amount: number;
    status?: PaymentStatusValue;
    method?: PaymentMethodValue;
    note?: string | null;
    createdBy?: bigint | null;
    // Default true (simulated / already-settled). False for awaiting_payment rows.
    creditLedger?: boolean;
  },
): Promise<bigint> {
  const [pay] = await tx
    .insert(payments)
    .values({
      orderId: input.orderId,
      status: input.status ?? "simulated_paid",
      method: input.method ?? "simulated",
      amount: input.amount.toFixed(2),
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: payments.id });
  if (input.creditLedger !== false) {
    await ledgerService.record(tx, {
      userId: input.userId,
      orderId: input.orderId,
      paymentId: pay.id,
      direction: "credit",
      type: "payment",
      amount: input.amount,
    });
  }
  return pay.id;
}

export interface CreateOrderInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; phone: string; email: string; addressLine: string; city: string; postalCode: string };
  // Internal users.id of the lead owner to carry onto the order (set by the
  // convert flow so the order inherits the inquiry's currentOwner). Null/omitted
  // for ordinary checkout.
  currentOwner?: bigint | null;
  // Customer-entered public coupon code. Re-resolved server-side here — never
  // trust a client-sent discount amount.
  couponCode?: string | null;
  // Staff-applied rep daily coupon: the code the actor owns plus the amount they
  // requested (clamped to the dual ceiling on the server). A requestedAmount that
  // arrives without a backing valid rep coupon owned by the actor is rejected.
  repCoupon?: { code: string; requestedAmount: number } | null;
  // Wallet coins the customer wants to spend — a COUNT, never an amount. The
  // server resolves the currency value against the active coin_rate.
  coins?: number;
  // Chosen payment method id (maps to payment_method enum / PaymentMethodConfig.id).
  // Omitted or "simulated" → today's simulated_paid path (also the fallback when no
  // methods are enabled). A real method requires it to be enabled in payment_config.
  paymentMethodId?: string | null;
}

export interface CreateOrderOptions {
  // Who performed the action — stamped as createdBy (the acting user's public_id).
  // For an agent order this is the staff member, NOT the order owner.
  actorId?: string | null;
  // The account the order belongs to (the owner's public_id). Set for a
  // logged-in customer's own checkout so the order attaches to their real
  // account regardless of the phone typed. Omitted for anonymous checkout and
  // agent orders, which resolve/provision the customer by phone.
  ownerUserId?: string | null;
}

// Resolve a user public_id (usr_…) to the internal bigint id. Returns null when
// the id is absent or doesn't match a user.
// This app has exactly one org (the seeded brand org) until franchise creation
// ships (spec §1/migration path) — resolving "the org new orders belong to" is
// unambiguous today, so orders are stamped directly rather than left NULL and
// read-side-tolerated. Revisit once a second (franchise) org can exist: this will
// need to become a resolved-context lookup (checkout zone/region -> org), not "the
// only brand org".
async function resolveBrandOrgId(tx: { select: typeof db.select }): Promise<string | null> {
  const [row] = await tx.select({ id: organization.id }).from(organization).where(isNull(organization.parentOrganizationId)).limit(1);
  return row?.id ?? null;
}

async function resolveUserId(
  tx: { select: typeof db.select },
  publicId: string | null | undefined,
): Promise<bigint | null> {
  if (!publicId) return null;
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

// The single authoritative order-creation path: prices server-side, attaches the
// order to the owner (provisioning a customer by phone when none is given), and
// writes the order + simulated payment in one tx. Used by the public checkout
// and the agent (convert) flow alike.
//
// The client speaks public_id: input.selections.mealSizeId is a meal size
// public_id, and opts.actorId/ownerUserId are user public_ids. createOrder
// resolves each to the internal bigint id before writing the FK columns, and
// returns the order's public_id (ord_…) — never a bigint.
export async function createOrder(
  input: CreateOrderInput,
  opts: CreateOrderOptions = {},
): Promise<{ deploymentId: string; publicId: string }> {
  const { actorId = null, ownerUserId = null } = opts;
  const snapshot = await loadCatalogSnapshot();

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  const mealSize = snapshot.mealSizes.find((m) => m.publicId === input.selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");
  // Dish selection happens per-delivery after subscribing, not at checkout —
  // order.categoryCounts/mealSlots are derived from the chosen meal size's own
  // server-loaded items, never trusted from the client-submitted selections.
  const categoryCounts = mealSize.items.reduce<Record<string, number>>((acc, i) => {
    acc[i.category] = (acc[i.category] ?? 0) + 1;
    return acc;
  }, {});
  const mealSlots = Object.keys(categoryCounts);
  if (mealSlots.length === 0) throw new ValidationError("At least one category is required");
  validateStartDate(input.selections.startDate, plan.allowedStartDays, new Date());
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!
  const pricingCatalog = buildPricingCatalog(snapshot, input.selections);
  // Base price (no discounts). Coupons are re-resolved server-side inside the tx
  // — where the owner/actor ids exist — then folded into the final total.
  const basePricing = priceSubscription(input.selections, pricingCatalog);
  const zone = matchZone(input.contact.postalCode, snapshot.zones);
  const zoneRow = zone ? snapshot.zones.find((z) => z.name === zone.name) : undefined;

  const parsedPhone = phoneSchema().safeParse(input.contact.phone);
  if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
  const phone = parsedPhone.data;
  // Email is required on every account: it is the login path and the only
  // channel for verification, reset and security alerts. The checkout UI
  // already disables Continue without one — this is the server-side enforcement
  // of that rule, which a direct POST would otherwise bypass.
  const parsedEmail = emailSchema.safeParse(input.contact.email?.trim());
  if (!parsedEmail.success) throw new ValidationError("An email address is required");
  const email = parsedEmail.data;

  const deploymentId = generateCode("SUB", 6);

  // Resolve the payment rail and app currency before the tx. Empty config /
  // omitted id → simulated (today's instant-paid path). A real id must be
  // enabled and map to the enum.
  const paymentCfg = await getPaymentConfig();
  const { currency } = await getAppSettings();
  const requestedMethodId = input.paymentMethodId?.trim() || null;
  const realMethods = enabledMethods(paymentCfg);
  const useSimulated =
    !requestedMethodId ||
    requestedMethodId === "simulated" ||
    realMethods.length === 0;
  let paymentMethodId = "simulated";
  let methodTaxes: { name: string; ratePct: number }[] = [];
  if (!useSimulated) {
    const method = findMethod(paymentCfg, requestedMethodId!);
    if (!method || !method.enabled) {
      throw new ValidationError("That payment method is not available");
    }
    if (!payments.method.enumValues.includes(method.id as PaymentMethodValue)) {
      throw new ValidationError(`Unknown payment method: ${method.id}`);
    }
    paymentMethodId = method.id;
    methodTaxes = method.taxes;
  }
  const deferSettlement = paymentMethodId !== "simulated";

  const txResult = await db.transaction(async (tx) => {
    // Resolve the acting user and explicit owner public_ids to internal bigints.
    const createdBy = await resolveUserId(tx, actorId);
    const ownerId = await resolveUserId(tx, ownerUserId);

    // A logged-in customer's order attaches to their own account; anonymous and
    // agent orders resolve/provision the customer by phone.
    let userId = ownerId;
    if (!userId) {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
      userId = existing?.id ?? null;
    }
    if (!userId) {
      userId = await provisionCustomerByPhone(
        tx,
        { fullName: input.contact.fullName, phone, email },
        createdBy,
      );
    }
    if (!userId) throw new ValidationError("Could not resolve a customer for this order");

    const organizationId = await resolveBrandOrgId(tx);

    // Reject a new order whose delivery window overlaps a subscription this
    // customer already has running: "active"/"paused" orders reserve real
    // calendar days (materializeDeliveries wrote rows for them), so a second
    // order starting inside that reserved band would double-book delivery.
    // Waitlisted orders never materialize deliveries (out of zone), so they
    // don't occupy any dates and are excluded from this check.
    const newStart = parseIsoDateUtc(input.selections.startDate);
    const newEndExclusive = new Date(newStart);
    newEndExclusive.setUTCDate(newEndExclusive.getUTCDate() + input.selections.durationWeeks * 7);
    const currentOrders = await tx
      .select({ id: orders.id, startDate: orders.startDate, durationWeeks: orders.durationWeeks })
      .from(orders)
      .where(and(eq(orders.userId, userId), inArray(orders.status, ["active", "paused"])));
    // The reserved band uses each order's true last materialized delivery date, not
    // just startDate + durationWeeks*7 — pooled/rescheduled tiffins can push real
    // deliveries later than that naive window (see reservedEndDatesExclusive's doc).
    const reservedEnds = await reservedEndDatesExclusive(tx, currentOrders);
    for (const o of currentOrders) {
      const existingStart = parseIsoDateUtc(o.startDate);
      const existingEndExclusive = reservedEnds.get(o.id.toString())!;
      if (newStart < existingEndExclusive && existingStart < newEndExclusive) {
        const lastDay = new Date(existingEndExclusive);
        lastDay.setUTCDate(lastDay.getUTCDate() - 1);
        throw new ValidationError(
          `You already have a plan running through ${lastDay.toISOString().slice(0, 10)} — choose a start date after it ends`,
        );
      }
    }

    // Server-side discount resolution. Both coupon kinds land as a single
    // adjustments[] line; the redemptions (row + ledger debit) are written
    // in-tx below once the order id exists — or deferred into the pricing
    // snapshot when settlement awaits staff verification. The client never sets
    // the amount.
    const adjustments: PricingLine[] = [];
    const redemptions: { coupon: typeof coupons.$inferSelect; amount: number; redeemedBy: bigint | null }[] = [];

    if (input.repCoupon) {
      // Hard gate: a discount amount with no acting staff member is rejected.
      if (createdBy == null) throw new ValidationError("A rep discount requires an acting staff member");
      const line = await couponsService.validateRepCoupon(input.repCoupon.code, {
        subtotal: basePricing.subtotal,
        requestedAmount: input.repCoupon.requestedAmount,
        actorId: createdBy,
        planType: plan.planType,
        userId,
      });
      const coupon = await couponsService.findByCode(input.repCoupon.code);
      adjustments.push(line);
      redemptions.push({ coupon, amount: line.amount, redeemedBy: createdBy });
    }

    // Customer lane: the best valid combination of auto-apply coupons plus an
    // optional manual code, re-resolved server-side (never trusting a client
    // amount). Method-gated coupons are filtered via paymentMethodId.
    //
    // Rep-aware: when a rep coupon is also applied, an exclusive coupon could never
    // legally ride alongside it, so we ask for the best STACKABLE-only combo.
    const best = await couponsService.resolveBestCoupons({
      subtotal: basePricing.subtotal,
      planType: plan.planType,
      userId,
      paymentMethodId,
      manualCode: input.couponCode,
      stackableOnly: !!input.repCoupon,
    });
    // A manual code that was explicitly entered but is invalid / expired /
    // ineligible fails the order with the reason — the auto set would otherwise
    // silently drop it. Auto-apply coupons never trigger this.
    if (input.couponCode && best.manualError) throw new ValidationError(best.manualError);

    // Stacking with the rep lane: a customer who *explicitly* typed an exclusive
    // code alongside a rep discount is always told they cannot combine.
    if (input.repCoupon && input.couponCode?.trim()) {
      const manualCoupon = await couponsService.findByCode(input.couponCode.trim());
      if (!manualCoupon.stackable) {
        throw new ValidationError("This coupon cannot be combined with another discount");
      }
    }
    // Re-distribute every kept line against the running remaining subtotal so the
    // summed redemption amounts can never exceed the order subtotal.
    const customerSet = best.redemptions;
    for (const r of customerSet) {
      const priorDiscount = adjustments.reduce((sum, a) => sum + a.amount, 0);
      const remaining = Math.max(0, Math.round((basePricing.subtotal - priorDiscount + Number.EPSILON) * 100) / 100);
      const amount = Math.min(r.amount, remaining);
      if (amount <= 0) continue;
      adjustments.push({ label: `${r.coupon.name} (${r.coupon.code})`, amount });
      redemptions.push({ coupon: r.coupon, amount, redeemedBy: createdBy });
    }

    // Coins are a discount like any other: resolved server-side against the
    // remaining subtotal, never from a client-sent amount. Capped against the
    // PRE-TAX remaining subtotal rather than the order total, both because the
    // total is not known until after this adjustment lands and because a
    // discount should not erase tax. Insufficient coins fails the order —
    // lockAndQuoteCoinRedemption throws, same as an invalid manual coupon code.
    let coinRedemption: { coinsSpent: number; currencyValue: number } | null = null;
    if (input.coins && input.coins > 0 && userId != null) {
      const priorDiscount = adjustments.reduce((sum, a) => sum + a.amount, 0);
      const remaining = Math.max(0, Math.round((basePricing.subtotal - priorDiscount + Number.EPSILON) * 100) / 100);
      if (remaining > 0) {
        const rate = await walletService.activeRate(currency);
        coinRedemption = await lockAndQuoteCoinRedemption(tx, {
          userId, coins: input.coins, rate, cap: remaining,
        });
        if (coinRedemption.currencyValue > 0) {
          adjustments.push({ label: `Coins (${coinRedemption.coinsSpent})`, amount: coinRedemption.currencyValue });
        }
      }
    }

    const pricing = priceSubscription(input.selections, pricingCatalog, adjustments, methodTaxes);

    // Snapshot is the immutable receipt. For deferred settlement, pending
    // redemptions ride along until staff verify — then redeem + clear.
    const snapshot: OrderPricingSnapshot = {
      ...pricing,
      paymentMethodId,
      planType: plan.planType,
      ...(deferSettlement && redemptions.length
        ? {
            pendingRedemptions: redemptions.map((r) => ({
              couponPublicId: r.coupon.publicId,
              code: r.coupon.code,
              amount: r.amount,
              redeemedByPublicId: r.redeemedBy != null ? (actorId ?? null) : null,
            })),
          }
        : {}),
      // Gated on currencyValue, not coinsSpent: at a sub-cent rate capRedemption
      // can return coinsSpent > 0 with currencyValue rounding to 0.00. Parking or
      // debiting that would burn coins for a discount worth nothing.
      ...(deferSettlement && coinRedemption && coinRedemption.currencyValue > 0
        ? { pendingCoinRedemption: { coins: coinRedemption.coinsSpent, amount: coinRedemption.currencyValue } }
        : {}),
    };

    const status: OrderStatusValue = zoneRow ? "active" : "waitlisted";

    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        planId: plan.id,
        mealSizeId: mealSize.id,
        frequencyId: frequency.id,
        persons: input.selections.persons,
        mealSlots,
        categoryCounts,
        includeSaturday: input.selections.includeSaturday,
        includeSunday: input.selections.includeSunday,
        durationWeeks: input.selections.durationWeeks,
        startDate: input.selections.startDate,
        tiffinCount: pricing.tiffinCount,
        perTiffinPrice: pricing.perTiffinPrice.toFixed(2),
        pricingSnapshot: snapshot,
        total: pricing.total.toFixed(2),
        status,
        deploymentId,
        zoneId: zoneRow?.id ?? null,
        fullName: input.contact.fullName,
        addressLine: input.contact.addressLine,
        city: input.contact.city,
        postalCode: input.contact.postalCode,
        currentOwner: input.currentOwner ?? null,
        createdBy,
        organizationId,
      })
      .returning();

    // Start immediately: in-zone orders materialize deliveries now, even when
    // payment is still awaiting. UI tells the customer delivery begins once
    // payment is confirmed; unpaid days can be moved ahead later.
    if (order.status === "active") await materializeDeliveries(tx, order);

    await recordPayment(tx, {
      orderId: order.id,
      userId,
      amount: pricing.total,
      createdBy,
      method: paymentMethodId as PaymentMethodValue,
      status: deferSettlement ? "awaiting_payment" : "simulated_paid",
      creditLedger: !deferSettlement,
    });

    // Simulated path redeems immediately. Real-method path defers until verify
    // so an abandoned/unpaid order burns no coupon budget.
    if (!deferSettlement) {
      for (const r of redemptions) {
        await couponsService.redeem(tx, {
          coupon: r.coupon,
          userId,
          orderId: order.id,
          redeemedBy: r.redeemedBy,
          amountApplied: r.amount,
          context: { subtotal: basePricing.subtotal, planType: plan.planType, kind: r.coupon.kind },
        });
      }
      // Same predicate as the adjustment line and the snapshot park above.
      if (coinRedemption && coinRedemption.currencyValue > 0) {
        await commitCoinRedemption(tx, {
          userId,
          coins: coinRedemption.coinsSpent,
          currencyValue: coinRedemption.currencyValue,
          orderId: order.id,
        });
      }
    }

    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "created",
      toStatus: status,
      createdBy,
    });

    // Coins also defer on real methods — awarded in verifyPayment.
    return {
      deploymentId,
      publicId: order.publicId,
      awardUserId: !deferSettlement && status === "active" ? userId : null,
    };
  });

  try {
    if (txResult.awardUserId != null) {
      await walletService.award(txResult.awardUserId, "order_activated", { type: "order", id: txResult.publicId });
    }
  } catch (e) {
    log.error({ err: e }, "wallet award on activation failed");
  }

  return { deploymentId: txResult.deploymentId, publicId: txResult.publicId };
}

// Staff settles a real-method payment: credits the ledger, redeems any deferred
// coupons from the pricing snapshot, awards activation coins, and marks paid.
// Accepts awaiting_payment (e.g. cash confirmed without a customer claim) and
// pending_verification (after a claim). Idempotent against already-paid rows.
export async function verifyPayment(
  paymentPublicId: string,
  opts: { actorId?: string | null } = {},
): Promise<void> {
  const award = await db.transaction(async (tx) => {
    const [pay] = await tx.select().from(payments).where(eq(payments.publicId, paymentPublicId)).limit(1);
    if (!pay) throw new NotFoundError("Payment not found");
    if (pay.status === "paid" || pay.status === "simulated_paid") return null;
    if (pay.status !== "awaiting_payment" && pay.status !== "pending_verification") {
      throw new ValidationError(`Payment cannot be verified from status ${pay.status}`);
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId)).limit(1);
    if (!order?.userId) throw new NotFoundError("Order not found");

    const actorInternalId = await resolveUserId(tx, opts.actorId);

    await ledgerService.record(tx, {
      userId: order.userId,
      orderId: order.id,
      paymentId: pay.id,
      direction: "credit",
      type: "payment",
      amount: Number(pay.amount),
    });

    await tx
      .update(payments)
      .set({ status: "paid", capturedAt: Date.now() })
      .where(eq(payments.id, pay.id));

    // `payments` has baseColumns, not updatableColumns — there is no updatedBy on the row,
    // so the activity row is the only place the verifier's identity is ever recorded.
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "payment_verified",
      note: `${pay.method} · ${pay.amount}`,
      createdBy: actorInternalId,
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
        userId: order.userId,
        orderId: order.id,
        redeemedBy,
        amountApplied: r.amount,
        context: { subtotal: snap.subtotal, planType: snap.planType, kind: coupon.kind },
      });
    }

    if (snap.pendingCoinRedemption && snap.pendingCoinRedemption.coins > 0) {
      await commitCoinRedemption(tx, {
        userId: order.userId,
        coins: snap.pendingCoinRedemption.coins,
        currencyValue: snap.pendingCoinRedemption.amount,
        orderId: order.id,
      });
    }

    if (pending.length || snap.pendingCoinRedemption) {
      const { pendingRedemptions: _drop, pendingCoinRedemption: _dropCoins, ...rest } = snap;
      await tx
        .update(orders)
        .set({ pricingSnapshot: rest, updatedBy: actorInternalId })
        .where(eq(orders.id, order.id));
    }

    // Award coins only when the order is (still) active — waitlisted stays deferred
    // until activateOrder, which has its own award path.
    return order.status === "active" ? { userId: order.userId, orderPublicId: order.publicId } : null;
  });

  if (award) {
    try {
      await walletService.award(award.userId, "order_activated", { type: "order", id: award.orderPublicId });
    } catch (e) {
      log.error({ err: e }, "wallet award on payment verify failed");
    }
  }
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
  const refund = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.publicId, orderPublicId)).limit(1);
    if (!order) throw new NotFoundError(`Order not found: ${orderPublicId}`);

    const [pay] = await tx.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    if (!pay || (pay.status !== "paid" && pay.status !== "simulated_paid")) {
      throw new ValidationError(`Order ${orderPublicId} has no settled payment to refund`);
    }

    const actorInternalId = await resolveUserId(tx, opts.actorId);

    await tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, pay.id));
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: "Order refunded",
      createdBy: actorInternalId,
    });

    return order.userId ? { userId: order.userId, orderPublicId: order.publicId } : null;
  });

  if (refund) {
    try {
      await db.transaction((tx) =>
        reverseCoinAward(tx, {
          userId: refund.userId,
          eventType: "order_activated",
          source: { type: "order", id: refund.orderPublicId },
        }),
      );
    } catch (e) {
      log.error({ err: e }, "wallet award reversal on refund failed");
    }
  }
}

// Customer (or staff-on-behalf) marks a manual payment as sent. Requires a transfer
// reference and/or a proof image; requireProof on the method config forces the photo.
// awaiting_payment | rejected → pending_verification.
// Callers MUST authorize (assertCanManageOrder) before invoking — kept out of this
// function to avoid an orders ↔ customer-deliveries import cycle.
export async function claimPayment(
  paymentPublicId: string,
  input: { reference?: string | null; proof?: PaymentProof | null },
  actorId: bigint | null = null,
): Promise<void> {
  const [pay] = await db.select().from(payments).where(eq(payments.publicId, paymentPublicId)).limit(1);
  if (!pay) throw new NotFoundError("Payment not found");

  // awaiting_payment | rejected (fresh claim) or pending_verification (customer correcting).
  if (
    pay.status !== "awaiting_payment" &&
    pay.status !== "rejected" &&
    pay.status !== "pending_verification"
  ) {
    throw new ValidationError(`Payment cannot be claimed from status ${pay.status}`);
  }
  // Shared predicate covers the fresh-claim cases; pending_verification is a re-submit.
  if (pay.status !== "pending_verification" && !canClaim(pay.status)) {
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

  await db
    .update(payments)
    .set({
      reference,
      proof,
      claimedAt: Date.now(),
      status: "pending_verification",
      // Clear a prior reject note when re-claiming.
      note: null,
    })
    .where(eq(payments.id, pay.id));

  // Re-claiming after a rejection wipes payments.note, so the rejection reason survives
  // only here. Without this row a rejected-then-reclaimed payment has no history at all.
  await db.insert(orderActivities).values({
    orderId: pay.orderId,
    type: "payment_claimed",
    note: reference ? `${pay.method} · ref ${reference}` : `${pay.method} · proof attached`,
    createdBy: actorId,
  });
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

export type OrderListRow = {
  publicId: string;
  deploymentId: string;
  fullName: string;
  city: string;
  planKey: string;
  status: string;
  startDate: string;
  total: string;
  createdAt: number;
  ownerId: string | null;
  ownerName: string | null;
};

export type OrderSortColumn = "name" | "deployment" | "status" | "start" | "total" | "created";

// Server-side unified filters (Condition) + offset pagination + unpaginated
// total — mirrors inquiriesService.listForPipeline. All filterable facets
// (status/fullName/deploymentId/createdAt) live on the base `orders` table, so
// a plain columnResolver suffices (no FK subqueries). The rows query joins
// plans (inner, non-nullable FK — safe) and users (left, nullable
// currentOwner — display-only), but the count runs on the base `orders` table
// alone with the identical `where` so the nullable owner join can't inflate it.
// Client-scoping: which orgs a session may see. super_admin bypasses to "all";
// everyone else is scoped to their `member` rows — zero rows means zero orders,
// never the whole table (see @realm/auth resolveVisibleOrgIds).
export async function resolveSessionVisibleOrgIds(session: {
  user: { id: string; platformRole?: string | null };
} | null): Promise<"all" | string[]> {
  if (!session) return [];
  const userId = await resolveUserId(db, session.user.id);
  if (!userId) return [];
  const memberOrgIds = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .then((rows) => rows.map((r) => r.organizationId));
  return resolveVisibleOrgIds({ platformRole: session.user.platformRole ?? null, memberOrgIds });
}

export async function listOrdersPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<OrderSortColumn> = { column: "created", dir: "desc" },
  visible: "all" | string[],
): Promise<Page<OrderListRow>> {
  const where = and(
    conditionToSql(
      condition,
      columnResolver({
        status: orders.status,
        fullName: orders.fullName,
        deploymentId: orders.deploymentId,
        createdAt: orders.createdAt,
      }),
    ),
    visible === "all" ? undefined : inArray(orders.organizationId, visible),
  );

  const SORT_COL = {
    name: orders.fullName,
    deployment: orders.deploymentId,
    status: orders.status,
    start: orders.startDate,
    total: orders.total,
    created: orders.createdAt,
  } as const;
  const col = SORT_COL[sort.column] ?? orders.createdAt;

  const rows = await db
    .select({
      publicId: orders.publicId,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      city: orders.city,
      planKey: plans.key,
      status: orders.status,
      startDate: orders.startDate,
      total: orders.total,
      createdAt: orders.createdAt,
      ownerId: users.publicId,
      ownerName: users.name,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(users, eq(orders.currentOwner, users.id))
    .where(where)
    .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
    .limit(page.size)
    .offset(page.page * page.size);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(where);

  const items = rows.map((r) => ({ ...r, ownerId: r.ownerId ?? null, ownerName: r.ownerName ?? null }));
  return { items, page: page.page, size: page.size, total: count };
}

export type OrderPaymentDetail = {
  publicId: string;
  amount: string;
  status: (typeof payments.status.enumValues)[number];
  method: (typeof payments.method.enumValues)[number];
  reference: string | null;
  proof: PaymentProof | null;
  claimedAt: number | null;
  capturedAt: number | null;
  createdAt: number;
  note: string | null;
  // Public thumb URL for inline display; null when no proof.
  proofThumbUrl: string | null;
  // Token-gated href for the secured original; null when no proof.
  proofHref: string | null;
};

export type OrderDetail = typeof orders.$inferSelect & {
  planName: string;
  planKey: string;
  frequencyKey: string;
  mealSizeName: string;
  payments: OrderPaymentDetail[];
};

// Same org scoping as listOrdersPage (see @realm/auth resolveVisibleOrgIds). A
// publicId is unguessable but not a permission — direct-link/URL access must not
// bypass membership scoping. Out-of-scope orders fail exactly like nonexistent ones
// (NotFoundError) so a caller can't distinguish "not visible" from "doesn't exist".
export async function readOrder(publicId: string, visible: "all" | string[]): Promise<OrderDetail> {
  const [row] = await db
    .select({
      order: orders,
      planName: plans.name,
      planKey: plans.key,
      frequencyKey: deliveryFrequencies.key,
      mealSizeName: mealSizes.name,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(
      and(
        eq(orders.publicId, publicId),
        visible === "all" ? undefined : inArray(orders.organizationId, visible),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Order not found");
  const pays = await db
    .select({
      publicId: payments.publicId,
      amount: payments.amount,
      status: payments.status,
      method: payments.method,
      reference: payments.reference,
      proof: payments.proof,
      claimedAt: payments.claimedAt,
      capturedAt: payments.capturedAt,
      createdAt: payments.createdAt,
      note: payments.note,
    })
    .from(payments)
    .where(eq(payments.orderId, row.order.id));

  // Lazy import avoids pulling storage/mint into every orders.service caller path
  // that doesn't need proof hrefs (createOrder tests, etc.).
  const { attachmentHref } = await import("./ticket-attachments");
  const enriched: OrderPaymentDetail[] = await Promise.all(
    pays.map(async (p) => {
      const proof = p.proof ?? null;
      return {
        ...p,
        proof,
        proofThumbUrl: proof?.thumbUrl ?? null,
        proofHref: proof ? await attachmentHref(proof) : null,
      };
    }),
  );

  return {
    ...row.order,
    planName: row.planName,
    planKey: row.planKey,
    frequencyKey: row.frequencyKey,
    mealSizeName: row.mealSizeName,
    payments: enriched,
  };
}

export async function listOrderActivities(orderId: bigint) {
  const rows = await db
    .select({
      publicId: orderActivities.publicId,
      type: orderActivities.type,
      note: orderActivities.note,
      fromStatus: orderActivities.fromStatus,
      toStatus: orderActivities.toStatus,
      deliveryId: orderActivities.deliveryId,
      createdAt: orderActivities.createdAt,
      createdBy: orderActivities.createdBy,
      actorName: users.name,
      actorEmail: users.email,
      actorRole: users.role,
    })
    .from(orderActivities)
    .leftJoin(users, eq(orderActivities.createdBy, users.id))
    .where(eq(orderActivities.orderId, orderId))
    .orderBy(desc(orderActivities.createdAt));
  return rows;
}

type OrderStatusValue = (typeof orders.status.enumValues)[number];

// The order lifecycle is built on the shared commons abstractions: OrdersService
// extends the updatable entity service (inheriting read/update with managed-column
// stamping), and audit rows go through a BaseService create. A status change is a
// guarded update + an activity create — both stamped consistently (update →
// updatedBy/updatedAt, create → createdBy + public_id/created_at). Mirrors
// inquiries.service: the entity update and the activity create are sequential
// writes, since commons repositories each hold their own connection.
class OrdersService extends SessionUpdatableService<typeof orders> {
  private readonly activities = new SessionBaseService(
    new BaseRepository(db, orderActivities, orderActivities.publicId, orderActivities.id),
  );

  // durationWeeks/frequencyId drive delivery-row materialization (row count, cutoff dates);
  // once rows exist, changing either would silently desync them from the schedule they were
  // materialized against. Freeze both the moment any delivery row exists — including a
  // cancelled subscription's void rows, since cancel() never deletes them.
  async update(publicId: string, patch: Record<string, unknown>): Promise<typeof orders.$inferSelect> {
    if (patch.durationWeeks !== undefined || patch.frequencyId !== undefined) {
      const order = await this.read(publicId);
      const [row] = await db.select({ id: deliveries.id }).from(deliveries)
        .where(eq(deliveries.orderId, order.id)).limit(1);
      if (row) throw new ValidationError("Duration and frequency are fixed once a subscription is active");
    }
    return super.update(publicId, patch);
  }

  async activate(publicId: string): Promise<void> {
    const order = await this.read(publicId);
    if (order.status !== "waitlisted") {
      throw new ValidationError(`Cannot activate an order that is ${order.status}`);
    }
    const actorId = await this.currentUserId();

    // Status flip + delivery materialization + activity log in one tx: if
    // materialization throws, the whole activation rolls back — the design
    // forbids an "active" order with zero delivery rows. Bypasses the audited
    // update()/transition() path for the same reason createOrder does (see its
    // comment above): those helpers aren't tx-aware, so a raw in-tx write is
    // the smaller change vs threading a tx through the shared service layer.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(orders)
        .set({ status: "active", updatedBy: actorId })
        .where(eq(orders.publicId, publicId))
        .returning();
      if (!row) throw new NotFoundError(`Order not found: ${publicId}`);
      await tx.insert(orderActivities).values({
        orderId: row.id,
        type: "activated",
        fromStatus: order.status,
        toStatus: "active",
        createdBy: actorId,
      });
      await materializeDeliveries(tx, row);
      return row;
    });

    if (updated.userId != null) {
      // Real-method orders defer coins until payment verify — don't award here if
      // the payment is still unpaid/unverified.
      const [pay] = await db
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.orderId, updated.id))
        .limit(1);
      const settled = !pay || pay.status === "paid" || pay.status === "simulated_paid";
      if (settled) {
        try {
          await walletService.award(updated.userId, "order_activated", { type: "order", id: updated.publicId });
        } catch (e) {
          log.error({ err: e }, "wallet award on activation failed");
        }
      }
    }
  }

  // Terminal: cancel() has no reverse. activate()'s existing `if (c !== "waitlisted") throw`
  // guard already forbids reactivating a cancelled order — no separate check needed here.
  // Bypasses transition()/update() for the same reason activate() does: cancelDeliveries must
  // run in the SAME tx as the status flip (a crash between the two must roll back both), and
  // the lock must be taken before the pre-cancelled guard is evaluated (TOCTOU — see
  // skipDelivery in deliveries.service.ts for the same shape).
  async cancel(publicId: string): Promise<void> {
    const actorId = await this.currentUserId();
    await db.transaction(async (tx) => {
      const [idRow] = await tx.select({ id: orders.id }).from(orders)
        .where(eq(orders.publicId, publicId)).limit(1);
      if (!idRow) throw new NotFoundError(`Order not found: ${publicId}`);
      await tx.execute(sql`select pg_advisory_xact_lock(${idRow.id})`);

      const [order] = await tx.select().from(orders).where(eq(orders.id, idRow.id)).limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      if (order.status === "cancelled") throw new ValidationError("Order is already cancelled");

      const [row] = await tx.update(orders).set({ status: "cancelled", updatedBy: actorId })
        .where(eq(orders.id, order.id)).returning();
      await cancelDeliveries(tx, row.id);
      await tx.insert(orderActivities).values({
        orderId: row.id,
        type: "cancelled",
        fromStatus: order.status,
        toStatus: "cancelled",
        createdBy: actorId,
      });
    });
  }

  // Delegates the actual row-marking to pauseRange (which validates the window and does its own
  // locked, cutoff-aware update). The order flips to "paused" only if every future original ended
  // up paused — a window narrower than the subscription leaves the order "active" with some rows
  // paused and others still scheduled.
  // assertPauseAllowed runs BEFORE pauseRange so limit/overlap violations ("already paused",
  // "pause limit reached", etc.) surface ahead of pauseRange's own date-format/order validation —
  // both throw ValidationError so callers can't tell the difference, but it keeps the limits check
  // authoritative over a window that would otherwise be silently accepted.
  // Indefinite pauses use the order's LAST delivery date as the until-date sentinel (until_date is
  // NOT NULL in subscription_pauses) — getPauseUsage counts those days toward cumulative usage by design.
  async pause(publicId: string, window: { from: string; until: string; indefinite?: boolean }): Promise<void> {
    const order = await this.read(publicId);
    if (order.status !== "active") throw new ValidationError(`Cannot pause an order that is ${order.status}`);
    const actorId = await this.currentUserId();

    let until = window.until;
    if (window.indefinite) {
      const [last] = await db.select({ d: sql<string>`max(${deliveries.deliveryDate})` })
        .from(deliveries).where(eq(deliveries.orderId, order.id));
      until = last?.d ?? window.from;
    }
    // assertPauseAllowed is a fast-path UX check only — it reads-then-writes with no lock, so
    // two concurrent pause requests can both pass it. The subscription_pauses_one_open_uniq
    // partial unique index is the real concurrency backstop: it makes a second OPEN pause row
    // for this order impossible at the DB level. A losing concurrent request surfaces here as a
    // 23505 unique violation, which we map to the same "already paused" error assertPauseAllowed
    // would have thrown had it seen the winner's row in time. pauseRange already ran by this
    // point, but its per-delivery update is a no-op on rows the winner already paused, so the
    // loser leaves no inconsistent delivery state behind.
    await assertPauseAllowed(order.id, window.from, until, window.indefinite ?? false);
    await pauseRange(publicId, window.from, until);

    try {
      await db.insert(subscriptionPauses).values({
        orderId: order.id,
        fromDate: window.from,
        untilDate: until,
        isIndefinite: window.indefinite ?? false,
        createdBy: actorId,
      });
    } catch (e) {
      if (isOpenPauseConflict(e)) throw new ValidationError("already paused — resume first");
      throw e;
    }

    const [remaining] = await db.select({ id: deliveries.id }).from(deliveries)
      .where(and(
        eq(deliveries.orderId, order.id),
        isNull(deliveries.makeupForDeliveryId),
        gt(deliveries.cutoffAt, Date.now()),
        ne(deliveries.status, "paused"),
      ))
      .limit(1);

    // A pause window narrower than the subscription leaves future deliveries scheduled, so
    // the ORDER stays active — but the customer did pause something. The log write used to
    // sit behind this early return, which meant every partial vacation was invisible.
    const full = !remaining;
    const note = `${window.from} → ${until}${window.indefinite ? " (indefinite)" : ""}`;
    if (full) await this.update(publicId, { status: "paused" });
    await this.activities.create({
      orderId: order.id,
      type: "paused",
      note,
      ...(full ? { fromStatus: order.status, toStatus: "paused" as const } : {}),
    });
  }

  // Delegates to resumeOrderDeliveries (reverts future paused rows to scheduled) then always flips
  // the order back to "active" — the guard above already requires the order to be "paused". Stamps
  // the open pause row (resumedAt IS NULL) closed in the same flow so the one-active-pause guard
  // releases and a new pause becomes legal again.
  //
  // The status flip is a CONDITIONAL update (WHERE status = 'paused'), not the usual this.update().
  // autoResumeIfElapsed runs on the read path (myActiveSubscriptions) with no lock, so two
  // concurrent renders can both read status="paused" and both call resume(). Only the request whose
  // UPDATE actually matches a row (i.e. the one that wins the race) proceeds to revert deliveries,
  // close the pause row, and log the "resumed" activity — the loser gets zero rows back and returns
  // as a no-op instead of writing a duplicate activity / redundant delivery revert.
  // `fromDate` (ISO) resumes a vacation partway: only paused days on/after it come back; earlier
  // paused days move to the remain pool (see resumeOrderDeliveries). Omit for a full resume.
  async resume(publicId: string, actorId?: bigint, fromDate?: string): Promise<void> {
    const order = await this.read(publicId);
    if (order.status !== "paused") throw new ValidationError(`Cannot resume an order that is ${order.status}`);
    const resolvedActorId = actorId ?? (await this.currentUserId()) ?? null;

    const [flipped] = await db.update(orders)
      .set({ status: "active", updatedBy: resolvedActorId })
      .where(and(eq(orders.publicId, publicId), eq(orders.status, "paused")))
      .returning({ id: orders.id });
    if (!flipped) return;

    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: publicId,
      operation: "update",
      changes: { status: { from: order.status, to: "active" } },
      createdBy: resolvedActorId,
    });
    await resumeOrderDeliveries(publicId, fromDate);
    await db.update(subscriptionPauses)
      .set({ resumedAt: new Date(), resumedBy: resolvedActorId })
      .where(and(eq(subscriptionPauses.orderId, order.id), isNull(subscriptionPauses.resumedAt)));
    await this.activities.create({
      orderId: order.id,
      type: "resumed",
      fromStatus: order.status,
      toStatus: "active",
    });
  }

  async reassign(publicId: string, ownerId: string): Promise<void> {
    await assertReassignAllowed();
    const owner = await resolveAssignableOwner(ownerId);
    await this.update(publicId, { currentOwner: owner.id });
  }
}

export const ordersService = new OrdersService(new UpdatableRepository(db, orders, orders.publicId, orders.id));

export const activateOrder = (publicId: string): Promise<void> => ordersService.activate(publicId);
export const cancelOrder = (publicId: string): Promise<void> => ordersService.cancel(publicId);
export const pauseOrder = (publicId: string, window: { from: string; until: string; indefinite?: boolean }): Promise<void> =>
  ordersService.pause(publicId, window);
export const resumeOrder = (publicId: string, actorId?: bigint, fromDate?: string): Promise<void> =>
  ordersService.resume(publicId, actorId, fromDate);
export const reassignOrder = (publicId: string, ownerId: string): Promise<void> =>
  ordersService.reassign(publicId, ownerId);

// Flips a fully-paused order back to "active" once its open (non-indefinite) pause window has
// elapsed. No-op if there's no open pause, the pause is indefinite, or untilDate hasn't passed yet.
// Called from myActiveSubscriptions before it reports order status to the customer.
export async function autoResumeIfElapsed(orderId: bigint): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [open] = await db.select({ untilDate: subscriptionPauses.untilDate, isIndefinite: subscriptionPauses.isIndefinite })
    .from(subscriptionPauses)
    .where(and(eq(subscriptionPauses.orderId, orderId), isNull(subscriptionPauses.resumedAt)))
    .limit(1);
  if (!open || open.isIndefinite || open.untilDate >= today) return;
  const [ord] = await db.select({ publicId: orders.publicId, status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (ord?.status === "paused") {
    await ordersService.resume(ord.publicId);
    return;
  }
  // Partial pause: the order never fully paused (some deliveries stayed scheduled), so status is
  // still "active" and resume()'s status guard doesn't apply — close the elapsed open row directly
  // so getPauseUsage().hasOpenPause releases and a new pause becomes legal again. resumedBy stays
  // null (system auto-close, not an actor); no order-status change means no activity row.
  await db.update(subscriptionPauses)
    .set({ resumedAt: new Date() })
    .where(and(eq(subscriptionPauses.orderId, orderId), isNull(subscriptionPauses.resumedAt)));
}
