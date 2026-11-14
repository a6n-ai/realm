import { parseCustomerContact } from "@/lib/services/contact";
import { isCustomerRole } from "@/lib/roles";
import { formatMoney, generateCode, ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { enabledMethods, findMethod } from "@foundry/payments";
import { replaceOlderUnpaidCheckouts } from "./unpaid-checkouts";
import { eq } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { defaultOwner } from "../staff/default-owner";
import { getBrandOrgId } from "../services/organizations.service";
import { priceWithTax } from "@/lib/tax/checkout-taxes";
import {
  coupons,
  orderActivities,
  orderAddons,
  orders,
  payments,
  users,
} from "@/db/schema";
import { resolveUserId } from "@/lib/identity/user-ids";
import { sendMetaPurchaseOnce } from "@/lib/meta/purchase";
import { runInBackground } from "@foundry/cloud/background";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { categoryCountsFromItems } from "@/lib/menu/pick-size";
import { countsWithAddons, orderAddonValues } from "@/lib/menu/order-addon-items";
import { findZone } from "@/lib/catalog/zone-match";
import { parseCanadianPostalCode } from "@/lib/catalog/postal";
import { addressService } from "../services/addresses.service";
import { resolveDropOff, setAddressDropOff } from "../deliveries/address-drop-off.service";
import { priceSubscription, type OrderPricingSnapshot, type PricingLine, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { quoteTrial } from "@/lib/trial/quote";
import { round2 } from "@foundry/commons/util/money";
import { postCatalogSubtotal } from "@/lib/pricing/discounts";
import { couponsService } from "../coupons/coupons.service";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { orderTemplateVars } from "@/lib/notifications/events";
import { scheduleWrite } from "../deliveries/holiday-apply";
import { ledgerService } from "../payments/ledger.service";
import { assertStartable } from "./order-window";
import { matchCustomerAccounts, provisionCustomerByPhone, STAFF_ACCOUNT_MESSAGE } from "../services/customers.service";
import { appToday, validateStartDate } from "@/lib/dates/start-date";
import {
  lockAndQuoteCoinRedemption,
  balanceInTx,
  commitCoinRedemption,
  reserveCoinRedemption,
  awardOrderCoins,
} from "../wallet/wallet.service";
import { awardReferral } from "../referrals/referrals.service";
import { eatingDaysError, orderDeliveryDays, planDaysError, type DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import { getAppSettings } from "@/lib/settings";
import { getPaymentConfig } from "@/lib/payments/payment-config";
import { coinQuote, loadCoinConfig } from "./quote";
import { loadMealCostFloor } from "@/lib/pricing/meal-cost";
import { applyDiscountLane } from "@/lib/coupons/discount-lane";
import { isProduction } from "@/lib/runtime/env";
import { lockUser } from "@/lib/identity/lock-user";
import { lockOrder } from "./order-lock";

const log = createLogger("orders.service");

type PaymentStatusValue = (typeof payments.status.enumValues)[number];
type PaymentMethodValue = (typeof payments.method.enumValues)[number];

// tx-aware payment recording: writes the payments row, and (unless creditLedger is
// false) a matching ledger credit. Real-method checkouts defer the credit until
// staff verify — they pass creditLedger: false and status: awaiting_payment.
async function recordPayment(
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
    taxSource?: string | null;
    taxCalculationId?: string | null;
    expiresAt?: number | null;
  },
): Promise<{ id: bigint; publicId: string }> {
  const [pay] = await tx
    .insert(payments)
    .values({
      orderId: input.orderId,
      status: input.status ?? "simulated_paid",
      method: input.method ?? "simulated",
      amount: input.amount.toFixed(2),
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
      taxSource: input.taxSource ?? null,
      taxCalculationId: input.taxCalculationId ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: payments.id, publicId: payments.publicId });
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
  return pay;
}

export interface CreateOrderInput {
  /** A saved address to use as the plan's main address (must belong to the customer). Omitted = save the typed contact address. */
  addressPublicId?: string | null;
  selections: PricingSelections;
  planKey: string;
  contact: {
    fullName: string;
    phone: string;
    email: string;
    addressLine: string;
    // Always a distinct, customer-typed field — Google's formatted address has
    // no reliable subpremise/unit field, so this is never parsed out of
    // addressLine. deliveryInstructions is one free-text note (gate code,
    // leave at door, etc.), same pattern as puchkaman/Amazon.
    addressUnit?: string | null;
    city: string;
    postalCode: string;
    deliveryInstructions?: string | null;
    // Resolved via @foundry/places' resolveAndPersist() at the action layer, not here —
    // this service only stores whatever it's given, null when omitted.
    lat?: number | null;
    lng?: number | null;
  };
  // Internal users.id of the lead owner to carry onto the order (set by the
  // convert flow so the order inherits the inquiry's currentOwner). Null/omitted
  // for ordinary checkout.
  currentOwner?: bigint | null;
  // Customer-entered public coupon code. Re-resolved server-side here — never
  // trust a client-sent discount amount.
  couponCode?: string | null;
  // Several typed codes; couponCode is merged in.
  couponCodes?: string[] | null;
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

const STRIPE_ORDER_TTL_MS = 48 * 3600_000;
const STRIPE_STAFF_ORDER_TTL_MS = 7 * 24 * 3600_000;

export interface CreateOrderOptions {
  // Who performed the action — stamped as createdBy (the acting user's public_id).
  // For an agent order this is the staff member, NOT the order owner.
  actorId?: string | null;
  // The account the order belongs to (the owner's public_id). Set for a
  // logged-in customer's own checkout so the order attaches to their real
  // account regardless of the phone typed. Omitted for anonymous checkout and
  // agent orders, which resolve/provision the customer by phone.
  ownerUserId?: string | null;
  // Franchise the checkout resolved to (resolveRequestOrg), so the priced
  // catalog snapshot matches the one the customer's wizard/checkout priced
  // against. NOT the org the order is stamped to — see getBrandOrgId.
  orgId?: string | null;
  // Staff-only (set by dashboard server actions, never from client input): may
  // order a hidden custom meal size for any customer.
  allowCustomMeal?: boolean;
  /** Staff-created order: a Stripe payment link stays payable for 7 days instead of 48 hours. */
  staffCreated?: boolean;
  // Staff-only: replaces a custom meal's computed per-tiffin base price before
  // the pricing engine runs (discounts still apply).
  basePriceOverride?: number;
  /** Meta CAPI browser context from the customer's checkout request. */
  metaAttribution?: {
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbp?: string;
    fbc?: string;
    eventSourceUrl?: string;
  } | null;
  /** False for renewals — Purchase CAPI is first-plan only. Default true. */
  metaPurchaseEligible?: boolean;
}

/**
 * New plans are for one person: one phone, one running plan, one eater. Checkout and the staff
 * order path call this before createOrder; createOrder itself still builds the few multi-person
 * plans migrated from WordPress (and their tests).
 */
export function assertOnePerson(input: Pick<CreateOrderInput, "selections">): void {
  if (input.selections.persons !== 1) throw new ValidationError("A plan is for one person. Each person needs their own account.");
}

// The single authoritative order-creation path: prices server-side, attaches the
// order to the owner (provisioning a customer by phone when none is given), and
// writes the order + simulated payment in one tx.
//
// The client speaks public_id: input.selections.mealSizeId is a meal size
// public_id, and opts.actorId/ownerUserId are user public_ids. createOrder
// resolves each to the internal bigint id before writing the FK columns, and
// returns the order's public_id (ord_…) — never a bigint.
export async function createOrder(
  input: CreateOrderInput,
  opts: CreateOrderOptions = {},
): Promise<{ deploymentId: string; publicId: string; paymentPublicId: string }> {
  const {
    actorId = null,
    ownerUserId = null,
    orgId = null,
    allowCustomMeal = false,
    staffCreated = false,
    basePriceOverride,
    metaAttribution = null,
    metaPurchaseEligible = true,
  } = opts;
  const snapshot = await loadCatalogSnapshot(orgId);
  // Staff included: a day past its cutoff has already been routed and cooked without this plan.
  const startBase = appToday(snapshot.timezone, snapshot.cutoffHour);

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  const mealSize = snapshot.mealSizes.find((m) => m.publicId === input.selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");
  // Custom meals are staff-only, renewals included: their price is set by staff per customer.
  if (mealSize.custom && !allowCustomMeal) throw new ValidationError("This meal isn't available. Please choose a plan.");
  if (basePriceOverride != null) {
    if (!mealSize.custom) throw new ValidationError("A price override is for custom meals only");
    if (!Number.isFinite(basePriceOverride) || basePriceOverride <= 0 || basePriceOverride > 1000) throw new ValidationError("Override must be between 0 and 1000");
  }
  // Dish selection happens per-delivery after subscribing, not at checkout —
  // order.categoryCounts/mealSlots are derived from the chosen meal size's own
  // server-loaded items, never trusted from the client-submitted selections.
  const categoryCounts = categoryCountsFromItems(mealSize.items);
  const mealSlots = Object.keys(categoryCounts);
  if (mealSlots.length === 0) throw new ValidationError("At least one category is required");
  const trial = mealSize.trial ? await quoteTrial(snapshot, input.selections, startBase) : null;
  if (!mealSize.trial && input.selections.trialDays != null) {
    throw new ValidationError("Only a trial meal has a day count");
  }
  if (trial) {
    input.selections = {
      ...input.selections,
      frequencyKey: trial.frequencyKey,
      // Stored like a regular meal size: the days it eats, on an every-day frequency.
      eatingDays: trial.eatingDays,
      durationWeeks: trial.durationWeeks,
      includeSaturday: false,
      includeSunday: false,
      addonSelections: [],
      trialDays: trial.length,
    };
  } else {
    validateStartDate(input.selections.startDate, plan.allowedStartDays, startBase);
  }
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey);
  if (!frequency) throw new ValidationError("Invalid delivery frequency");
  if (!trial && input.selections.eatingDays) {
    const { minTiffinsPerWeek, maxTiffinsPerWeek } = await getAppSettings();
    const err = eatingDaysError(
      orderDeliveryDays({ frequencyKey: frequency.key, weekdays: frequency.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false }),
      input.selections.eatingDays,
      { min: minTiffinsPerWeek, max: maxTiffinsPerWeek },
    );
    if (err) throw new ValidationError(err);
  }
  // Weekend dish, frequency fit and allowed days (e.g. a non-veg-only size while Tue/Thu are veg-only).
  const daysErr = planDaysError({
    eatingDays: input.selections.eatingDays ?? [],
    includeSaturday: input.selections.includeSaturday,
    includeSunday: input.selections.includeSunday,
    frequencyWeekdays: (frequency.weekdays ?? null) as DayOfWeek[] | null,
    servesWeekends: mealSize.servesWeekends,
    allowed: mealSize.allowedDays,
    trial: trial != null,
  });
  if (daysErr) throw new ValidationError(daysErr);
  // An override prices a custom size whose categories have no custom-meal pricing yet.
  const computedBase = mealSize.priceable ? mealSize.basePrice : null;
  const pricingSnapshotSource = basePriceOverride != null && !mealSize.priceable
    ? { ...snapshot, mealSizes: snapshot.mealSizes.map((m) => (m === mealSize ? { ...m, priceable: true } : m)) }
    : snapshot;
  const pricingCatalog = trial ? trial.catalog : buildPricingCatalog(pricingSnapshotSource, input.selections);
  if (basePriceOverride != null) pricingCatalog.mealSize = { ...pricingCatalog.mealSize, basePrice: round2(basePriceOverride) };
  // Base price (no discounts). Coupons are re-resolved server-side inside the tx
  // — where the owner/actor ids exist — then folded into the final total.
  const basePricing = priceSubscription(trial ? trial.pricingSelections : input.selections, pricingCatalog);
  // Before the zone lookup: a bare prefix ("M8") would otherwise match a zone.
  input.contact = { ...input.contact, postalCode: parseCanadianPostalCode(input.contact.postalCode) };
  let zoneRow = await findZone(snapshot.zones, input.contact, orgId);

  const { phone, email } = parseCustomerContact(input.contact);

  const deploymentId = generateCode("SUB", 6);

  // Resolve the payment rail and app currency before the tx. Simulated
  // (instant-paid) is a local-testing path only, and only when no rail is
  // enabled — otherwise a client that lost its method list would get a free,
  // already-paid order. A real id must be enabled and map to the enum.
  const paymentCfg = await getPaymentConfig();
  const { currency } = await getAppSettings();
  const requestedMethodId = input.paymentMethodId?.trim() || null;
  const realMethods = enabledMethods(paymentCfg);
  const useSimulated = realMethods.length === 0;
  if (useSimulated && isProduction()) {
    throw new ValidationError("Payments aren't set up yet. Please contact admin.");
  }
  if (!useSimulated && (!requestedMethodId || requestedMethodId === "simulated")) {
    throw new ValidationError("Choose a payment method");
  }
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

  // Canadian sales tax is destination-based: the DELIVERY address decides the
  // rate. Resolved inside priceWithTax (below), the same helper the checkout
  // preview uses, so the total shown is the total charged.
  const deferSettlement = paymentMethodId !== "simulated";

  // Every order has an owner: the inquiry's (convert), else the staff placing it, else the pool.
  // Resolved before the transaction so the rotation cursor write is not tied to it.
  const defaultOwnerId = input.currentOwner ?? (await defaultOwner(await resolveUserId(db, actorId), "order"));

  const txResult = await db.transaction(async (tx) => {
    const createdBy = await resolveUserId(tx, actorId);
    const ownerId = await resolveUserId(tx, ownerUserId);

    // Anonymous and agent orders resolve the customer by phone OR email: a returning customer who types a second
    // number would otherwise miss the phone match and die on the email-unique check. Every account match is scoped
    // to role="user": a staff/admin account must never own an order (STAFF_ACCOUNT_MESSAGE; provisionCustomerByPhone throws the same).
    if (ownerId) {
      const [ownerRow] = await tx.select({ role: users.role }).from(users).where(eq(users.id, ownerId)).limit(1);
      if (ownerRow && !isCustomerRole(ownerRow.role)) throw new ValidationError(STAFF_ACCOUNT_MESSAGE);
    }
    let userId = ownerId;
    if (!userId) {
      const matches = await matchCustomerAccounts(tx, phone, email);
      // Two rows means the number is one customer's and the address another's.
      // Picking either would bill a stranger and run the overlap guard against
      // their plan, so stop. The message names nobody: guests reach this too.
      if (matches.length > 1) {
        throw new ValidationError(
          "This phone number is saved on a different account than this email. Use the phone number on that account, or a different one.",
        );
      }
      userId = matches[0] ?? null;
    }
    if (!userId) {
      userId = await provisionCustomerByPhone(
        tx,
        {
          fullName: input.contact.fullName,
          phone,
          email,
          addressLine: input.contact.addressLine,
          city: input.contact.city,
          postalCode: input.contact.postalCode,
        },
        createdBy,
      );
    }
    if (!userId) throw new ValidationError("Could not resolve a customer for this order");

    const addressScope = { userId, orgId };
    const savedAddress = input.addressPublicId
      ? await addressService.getRow(addressScope, input.addressPublicId, tx)
      : await addressService.create(addressScope, input.contact, {
          tx,
          ifExists: "reuse",
          coords: input.contact.lat != null && input.contact.lng != null ? { lat: input.contact.lat, lng: input.contact.lng } : null,
        });
    // Drop-off belongs to the address: the one picked under it at checkout is saved back to it,
    // new or already in the book, for its next delivery or order.
    if (input.addressPublicId || input.selections.deliveryTagId || input.selections.deliveryStrategyIds?.length) {
      await setAddressDropOff(addressScope, { id: savedAddress.id }, { tagId: input.selections.deliveryTagId ?? null, strategyIds: input.selections.deliveryStrategyIds ?? [] }, tx);
    }
    if (input.addressPublicId) {
      const movedPostal = savedAddress.postalCode !== input.contact.postalCode;
      input.contact = {
        ...input.contact,
        fullName: savedAddress.fullName ?? input.contact.fullName,
        addressLine: savedAddress.addressLine,
        addressUnit: savedAddress.addressUnit,
        city: savedAddress.city,
        postalCode: savedAddress.postalCode,
        // Notes typed for this plan win; callers that send none (renewals) keep the address's.
        deliveryInstructions: input.contact.deliveryInstructions !== undefined ? input.contact.deliveryInstructions : savedAddress.deliveryInstructions,
        lat: savedAddress.lat == null ? null : Number(savedAddress.lat),
        lng: savedAddress.lng == null ? null : Number(savedAddress.lng),
      };
      if (movedPostal) zoneRow = await findZone(snapshot.zones, input.contact, orgId);
    }

    const organizationId = await getBrandOrgId(tx);

    // Reject a new order whose delivery window overlaps a subscription this
    // customer already has running: "active"/"paused" orders reserve real
    // calendar days (materializeDeliveries wrote rows for them), so a second
    // order starting inside that reserved band would double-book delivery.
    // Waitlisted orders never materialize deliveries (out of zone), so they
    // don't occupy any dates and are excluded from this check, as are cancelled/completed.
    await assertStartable(tx, {
      userId,
      organizationId,
      startDate: input.selections.startDate,
      durationWeeks: input.selections.durationWeeks,
    });

    // Server-side discount resolution. Both coupon kinds land as a single
    // adjustments[] line; the redemptions (row + ledger debit) are written
    // in-tx below once the order id exists — or deferred into the pricing
    // snapshot when settlement awaits staff verification. The client never sets
    // the amount.
    // Coupons and coins apply AFTER catalog discounts (which the engine adds itself), so
    // every base below is the post-catalog subtotal; `adjustments` holds coupon/coin lines only.
    const postCatalog = postCatalogSubtotal(basePricing.subtotal, basePricing.adjustments);
    const adjustments: PricingLine[] = [];
    const redemptions: { coupon: typeof coupons.$inferSelect; amount: number; redeemedBy: bigint | null }[] = [];
    const costFloor = await loadMealCostFloor(mealSize.publicId, basePricing.tiffinCount);

    // Customer lane then the staff lane, shared with the staff price preview. An explicitly
    // entered code that is invalid fails the order with the reason; auto-apply coupons never do.
    // costFloor refuses staff/manual coupons that would sell the plan below kitchen cost.
    const lane = await applyDiscountLane({
      postCatalog,
      planType: plan.planType,
      userId,
      paymentMethodId,
      manualCode: input.couponCode,
      manualCodes: input.couponCodes,
      rep: input.repCoupon ? { code: input.repCoupon.code, requestedAmount: input.repCoupon.requestedAmount, actorId: createdBy } : undefined,
      costFloor,
      strict: true,
    });
    adjustments.push(...lane.lines);
    for (const r of lane.applied) redemptions.push({ coupon: r.coupon, amount: r.amount, redeemedBy: createdBy });
    if (lane.rep && input.repCoupon) {
      redemptions.push({ coupon: await couponsService.findByCode(input.repCoupon.code), amount: lane.rep.amount, redeemedBy: createdBy });
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
      const remaining = Math.max(0, round2(postCatalog - priorDiscount));
      if (remaining > 0) {
        // Admin limit on the share of the PRE-TAX subtotal coins may cover
        // (NULL = unlimited). Bounded by `remaining` too, so coins can never
        // take the order below zero. capRedemption clamps rather than rejects:
        // asking for more coins than the cap allows spends only what the cap buys.
        const cfg = await loadCoinConfig(currency);

        // The share-of-balance limit is drawn from the balance, so read it under the same user row lock
        // lockAndQuoteCoinRedemption takes: unlocked, two concurrent orders could each draw the limit from
        // one balance and together spend past it.
        await lockUser(tx, userId);
        const walletBalance = await balanceInTx(tx, userId);
        const { rate, maxRedeemPctOfBalance: maxRedeemPct, pctCap, walletPctCap, cap: quote } = coinQuote(cfg, { balance: walletBalance, postCatalog, remaining });
        // Same rule as the checkout quote: refuse only when the share-of-balance limit is what binds. A
        // count over it that the order wouldn't use anyway (it needs fewer coins) still clamps below;
        // checkout sends back the number the customer typed. When it does bind here but the quote
        // passed, the balance moved since the price was shown, and spending fewer would charge more.
        if (input.coins > quote.maxCoins && quote.limitedBy === "wallet_pct") {
          throw new ValidationError(
            `You can use up to ${maxRedeemPct}% of the coins at once, ${quote.maxCoins} on this order. Check the price again.`,
          );
        }
        coinRedemption = await lockAndQuoteCoinRedemption(tx, {
          userId, coins: Math.min(input.coins, walletPctCap), rate, cap: Math.min(remaining, pctCap),
        });
        if (coinRedemption.currencyValue > 0) {
          adjustments.push({ label: `Coins (${coinRedemption.coinsSpent})`, amount: coinRedemption.currencyValue });
        }
      }
    }

    // ponytail: Stripe Tax (≤3s timeout) runs inside the coin-lock tx; move it before the tx if lock waits show up.
    const { pricing, taxProvince, tax } = await priceWithTax({
      selections: input.selections,
      catalog: pricingCatalog,
      adjustments,
      address: { line1: input.contact.addressLine, city: input.contact.city, postalCode: input.contact.postalCode },
      methodTaxes,
      reference: `order:${Date.now()}`,
      cache: false,
    });

    // Snapshot is the immutable receipt. For deferred settlement, pending
    // redemptions ride along until staff verify — then redeem + clear.
    const pricingSnapshot: OrderPricingSnapshot = {
      ...pricing,
      paymentMethodId,
      taxProvince,
      tax,
      planType: plan.planType,
      ...(basePriceOverride != null ? { basePriceOverride: { amount: pricingCatalog.mealSize.basePrice, computed: computedBase, byPublicId: actorId } } : {}),
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

    // Stripe orders start only once Stripe confirms payment (verifyPayment activates them).
    const status: OrderStatusValue = zoneRow ? (paymentMethodId === "stripe" ? "pending" : "active") : "waitlisted";

    // buildPricingCatalog already refused unknown/retired picks, so every id resolves.
    const selectedStrategyIds = (input.selections.deliveryStrategyIds ?? []).flatMap(
      (id) => snapshot.deliveryCharges?.deliveryStrategies.find((s) => s.publicId === id)?.id ?? [],
    );
    // The place type: picked, else the strategies' own (buildPricingCatalog checked they agree).
    const tagPublicId = input.selections.deliveryTagId
      ?? snapshot.deliveryCharges?.deliveryStrategies.find((s) => s.publicId === input.selections.deliveryStrategyIds?.[0])?.groupPublicId
      ?? null;
    const selectedTagId = tagPublicId ? (await resolveDropOff({ tagId: tagPublicId, strategyIds: [] }, tx)).tagId : null;
    const selectedAddressTag = input.selections.addressTagId
      ? snapshot.deliveryCharges?.addressTags.find((a) => a.publicId === input.selections.addressTagId)
      : null;

    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        planId: plan.id,
        mealSizeId: mealSize.id,
        frequencyId: frequency.id,
        persons: input.selections.persons,
        mealSlots,
        // Add-on rows ride in every tiffin, so picks and kitchen counts include them.
        categoryCounts: countsWithAddons(categoryCounts, pricingCatalog.addons),
        eatingDays: input.selections.eatingDays ?? null,
        // Legacy readers (meal grids, posters) still key off these flags, so mirror the eating days.
        includeSaturday: input.selections.eatingDays ? input.selections.eatingDays.includes("sat") : input.selections.includeSaturday,
        includeSunday: input.selections.eatingDays ? input.selections.eatingDays.includes("sun") : input.selections.includeSunday,
        durationWeeks: input.selections.durationWeeks,
        trialLength: trial?.length ?? null,
        trialWeekdays: trial?.weekdays ?? null,
        // Paused days go to the end of the plan unless the customer turns it off.
        autoMovePaused: true,
        startDate: input.selections.startDate,
        tiffinCount: pricing.tiffinCount,
        perTiffinPrice: pricing.perTiffinPrice.toFixed(2),
        pricingSnapshot,
        total: pricing.total.toFixed(2),
        deliveryCharge: (pricing.deliveryCharge?.totalDeliveryCharge ?? 0).toFixed(2),
        deliveryStrategyIds: selectedStrategyIds,
        deliveryTagId: selectedTagId,
        addressTagId: selectedAddressTag?.id ?? null,
        status,
        deploymentId,
        zoneId: zoneRow?.id ?? null,
        addressId: savedAddress.id,
        fullName: input.contact.fullName,
        addressLine: input.contact.addressLine,
        addressUnit: input.contact.addressUnit?.trim() || null,
        city: input.contact.city,
        postalCode: input.contact.postalCode,
        deliveryInstructions: input.contact.deliveryInstructions?.trim() || null,
        latitude: input.contact.lat ?? null,
        longitude: input.contact.lng ?? null,
        currentOwner: defaultOwnerId,
        createdBy,
        organizationId,
        metaAttribution: metaAttribution && Object.keys(metaAttribution).length ? metaAttribution : null,
        metaPurchaseEligible,
      })
      .returning();

    // Structured counterpart to the addon lines already inside pricingSnapshot —
    // see orderAddons' comment in db/schema/orders.ts. pricingCatalog.addons is
    // already the buildPricingCatalog-validated (eligible, priced, qty-clamped)
    // resolution of input.selections.addonSelections, so no re-validation needed here.
    if (pricingCatalog.addons.length) {
      await tx.insert(orderAddons).values(orderAddonValues(order.id, pricingCatalog.addons, pricing.tiffinCount, organizationId));
    }

    // In-zone orders start now and materialize deliveries, except Stripe orders:
    // those stay pending and start when the card payment settles (startPaidStripeOrder).
    if (order.status === "active") {
      // The order id is not visible to any other transaction yet; the lock is the contract applyHolidaysToOrder expects.
      await lockOrder(tx, order.id);
      await scheduleWrite(tx, order, createdBy, { materialize: true });
    }

    const recorded = await recordPayment(tx, {
      orderId: order.id,
      userId,
      amount: pricing.total,
      createdBy,
      method: paymentMethodId as PaymentMethodValue,
      status: deferSettlement ? "awaiting_payment" : "simulated_paid",
      creditLedger: !deferSettlement,
      taxSource: pricingSnapshot.tax?.source ?? null,
      taxCalculationId: pricingSnapshot.tax?.calculationId ?? null,
      ...(paymentMethodId === "stripe" ? { expiresAt: Date.now() + (staffCreated ? STRIPE_STAFF_ORDER_TTL_MS : STRIPE_ORDER_TTL_MS) } : {}),
    });

    // Cash is collected on delivery, so the customer gets an order confirmation that says payment is still due.
    if (paymentMethodId === "cash" && userId != null) {
      await enqueueNotification(tx, {
        event: "order_created",
        recipientId: userId,
        title: "Order received",
        body: `We've got order ${deploymentId}. Payment of ${formatMoney(pricing.total)} is due in cash on delivery.`,
        href: "/me/deliveries",
        data: {
          order: orderTemplateVars(deploymentId, input.contact.fullName, {
            paymentNote: `Payment of ${formatMoney(pricing.total)} is due in cash on delivery.`,
          }),
        },
        dedupeKey: `order_created:${order.publicId}`,
      });
    }

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
    } else if (coinRedemption && coinRedemption.currencyValue > 0 && userId != null) {
      // Real payment method: HOLD the coins now rather than waiting for
      // verification. The hold is a debit row the balance already counts, so the
      // customer's wallet drops immediately and the same coins can't fund a
      // second order in the meantime. verifyPayment settles it; if payment never
      // lands the hold lapses and the coins return without anyone intervening.
      // Coupons still defer as before — they have no hold primitive.
      await reserveCoinRedemption(tx, {
        userId,
        coins: coinRedemption.coinsSpent,
        currencyValue: coinRedemption.currencyValue,
        orderId: order.id,
      });
    }

    if (coinRedemption && coinRedemption.currencyValue > 0 && userId != null) {
      await enqueueNotification(tx, {
        event: "wallet_redeemed",
        recipientId: userId,
        title: "Coins applied to your order",
        body: `${coinRedemption.coinsSpent} coins (${formatMoney(coinRedemption.currencyValue)}) were applied to order ${deploymentId}.`,
        href: "/me/wallet",
        data: {
          wallet: {
            coins: String(coinRedemption.coinsSpent),
            value: formatMoney(coinRedemption.currencyValue),
            orderCode: deploymentId,
            customerName: input.contact.fullName || "there",
          },
        },
        dedupeKey: `wallet_redeemed:${order.publicId}`,
      });
    }

    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "created",
      toStatus: status,
      createdBy,
    });

    // Real methods earn coins in verifyPayment; waitlisted orders in activate.
    if (!deferSettlement && status === "active") {
      await awardReferral(tx, order, "simulated_paid");
      await awardOrderCoins(tx, order, "simulated_paid");
    }

    return { deploymentId, publicId: order.publicId, paymentPublicId: recorded.publicId, orderId: order.id, ownerId: userId };
  });

  // A new card checkout replaces the customer's older unpaid one, only once this order is safely committed
  // (staff-made orders are left alone).
  if (paymentMethodId === "stripe" && !staffCreated) {
    try {
      await replaceOlderUnpaidCheckouts(txResult.ownerId, txResult.orderId);
    } catch (e) {
      log.error({ err: e }, "replacing older unpaid stripe order failed");
    }
  }

  // Simulated (local) settle never hits verifyPayment — fire Purchase here once.
  if (!deferSettlement) runInBackground(() => sendMetaPurchaseOnce(txResult.paymentPublicId), "meta purchase");

  return { deploymentId: txResult.deploymentId, publicId: txResult.publicId, paymentPublicId: txResult.paymentPublicId };
}

type OrderStatusValue = (typeof orders.status.enumValues)[number];
