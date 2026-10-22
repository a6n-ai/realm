import { formatMoney, generateCode, NotFoundError, ValidationError, phoneSchema, emailSchema, parseIsoDateUtc, cutoffMsFor, zonedDateIso } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { BaseRepository, UpdatableRepository, conditionToSql, columnResolver, pageOrder } from "@foundry/database";
import { canVerify, enabledMethods, findMethod } from "@foundry/payments";
import { resolveVisibleOrgIds } from "@foundry/auth";
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { hasMissedDeliveries } from "@/lib/services/missed-where";
import { PAYMENT_REVIEW_STATUSES } from "@/lib/orders/display-status";
import { clearLookOutOnEnd } from "@/lib/orders/look-out";
import { db } from "@/db/client";
import { resolveCheckoutTaxes } from "@/lib/tax/checkout-taxes";
import {
  coupons,
  deliveries,
  deliveryCategorySwaps,
  deliveryExtraTiffins,
  deliveryMoves,
  mealSelections,
  deliveryFrequencies,
  member,
  mealSizes,
  orderActivities,
  orderAddons,
  orders,
  organization,
  payments,
  plans,
  subscriptionPauses,
  tickets,
  users,
  type PaymentProof,
} from "@/db/schema";
import { SessionBaseService, SessionUpdatableService, recordAudit } from "./session-service";
import type { SortState } from "@/lib/list/sort";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { categoryCountsFromItems } from "@/lib/menu/pick-size";
import { countsWithAddons, orderAddonValues } from "@/lib/menu/order-addon-items";
import { buildBoundedDeliveryRows, tripsFor } from "@/lib/orders/bounded-deliveries";
import { findZone } from "@/lib/catalog/zone-match";
import { parseCanadianPostalCode } from "@/lib/catalog/postal";
import { addressService } from "./addresses.service";
import { resolveDropOff, setAddressDropOff } from "./address-drop-off.service";
import { priceSubscription, type OrderPricingSnapshot, type PricingLine, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { quoteTrial } from "@/lib/trial/quote";
import { round2 } from "@/lib/custom-meal/pricing";
import { postCatalogSubtotal } from "@/lib/pricing/discounts";
import { couponsService } from "./coupons.service";
import { enqueueNotification, enqueueStaffNotification } from "@/lib/notifications/enqueue";
import { cancelDeliveries, deleteFromOptimoRouteBestEffort, dropVoidRows, materializeDeliveries, pauseRange, resumeOrder as resumeOrderDeliveries, shiftMissedDeliveries, type OptimoSyncedRow } from "./deliveries.service";
import { applyHolidaysToOrder } from "./holiday-apply";
import { assertStartNotHoliday } from "./holiday-dates";
import { lapseElapsedPausesSafe } from "./pause-days.service";
import { retireLegacyPaused } from "./pause-state";
import { ledgerService } from "./ledger.service";
import { assertNoPlanOverlap } from "./order-window";
import { matchCustomerAccounts, provisionCustomerByPhone, STAFF_ACCOUNT_MESSAGE } from "./customers.service";
import { assertPauseAllowed } from "./pause-limits.service";
import { appToday, validateStartDate } from "./start-date";
import { assertTrialStart } from "@/lib/trial/schedule";
import {
  walletService,
  lockAndQuoteCoinRedemption,
  commitCoinRedemption,
  reserveCoinRedemption,
  settleCoinReservation,
  recollectLapsedCoins,
  reverseCoinRedemption,
  reverseCoinAward,
  awardOrderCoins,
} from "./wallet.service";
import { awardReferral, reverseReferral } from "./referrals.service";
import { assertReassignAllowed, resolveAssignableOwner } from "./reassign";
import { eatingDaysError, orderDeliveryDays, planWeek, weekendDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";
import { mealSizeServesWeekends } from "./weekend-dish";
import { getAppSettings, getMaxCoinPctOfSubtotal, getMaxCoinRedeemPctOfBalance, getPaymentConfig } from "./app-settings.service";
import { publishAnalyticsLive, publishPaymentsInbox, publishUserRefresh } from "@/lib/realtime/publish-inbox";

const log = createLogger("orders.service");

// True when a Postgres unique-violation (23505) hit the one-open-pause partial
// index. drizzle wraps the driver error, so the real PostgresError (with code +
// constraint_name) sits on .cause; postgres.js names the field constraint_name.
function isOpenPauseConflict(e: unknown): boolean {
  type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr };
  const err = e as PgErr;
  const layers = [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
  return layers.some(
    (l) => l.code === "23505" && (l.constraint ?? l.constraint_name ?? "").includes("subscription_pauses_one_open_unique"),
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
  // Several typed codes; couponCode is kept for older callers and merged in.
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
  // against. NOT the org the order is stamped to — see resolveBrandOrgId.
  orgId?: string | null;
  // Staff-only (set by dashboard server actions, never from client input): may
  // order a hidden custom meal size for any customer.
  allowCustomMeal?: boolean;
  // Staff-only: replaces a custom meal's computed per-tiffin base price before
  // the pricing engine runs (discounts still apply).
  basePriceOverride?: number;
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
/**
 * New plans are for one person: one phone, one running plan, one eater. Checkout and the staff
 * order path call this before createOrder; createOrder itself still builds the few multi-person
 * plans migrated from WordPress (and their tests).
 */
export function assertOnePerson(input: Pick<CreateOrderInput, "selections">): void {
  if (input.selections.persons !== 1) throw new ValidationError("A plan is for one person. Each person needs their own account.");
}

export async function createOrder(
  input: CreateOrderInput,
  opts: CreateOrderOptions = {},
): Promise<{ deploymentId: string; publicId: string }> {
  const { actorId = null, ownerUserId = null, orgId = null, allowCustomMeal = false, basePriceOverride } = opts;
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
  const weekendErr = weekendDaysError([
    ...(input.selections.eatingDays ?? []),
    ...(input.selections.includeSaturday ? ["sat" as const] : []),
    ...(input.selections.includeSunday ? ["sun" as const] : []),
  ], mealSize.servesWeekends);
  if (weekendErr) throw new ValidationError(weekendErr);
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

  // Resolve the payment rail and app currency before the tx. Simulated
  // (instant-paid) is a local-testing path only, and only when no rail is
  // enabled — otherwise a client that lost its method list would get a free,
  // already-paid order. A real id must be enabled and map to the enum.
  const paymentCfg = await getPaymentConfig();
  const { currency } = await getAppSettings();
  const requestedMethodId = input.paymentMethodId?.trim() || null;
  const realMethods = enabledMethods(paymentCfg);
  const useSimulated = realMethods.length === 0;
  if (useSimulated && process.env.NODE_ENV === "production") {
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
  // rate. Resolved through the same helper the checkout preview uses, so the
  // total shown is the total charged.
  const { taxes, province: taxProvince } = await resolveCheckoutTaxes({
    postalCode: input.contact.postalCode,
    methodTaxes,
  });

  const deferSettlement = paymentMethodId !== "simulated";

  const txResult = await db.transaction(async (tx) => {
    // Resolve the acting user and explicit owner public_ids to internal bigints.
    const createdBy = await resolveUserId(tx, actorId);
    const ownerId = await resolveUserId(tx, ownerUserId);

    // A logged-in customer's order attaches to their own account; anonymous and
    // agent orders resolve/provision the customer by phone OR email.
    //
    // Email is in this lookup, not just phone, because the overlap guard below
    // is only as good as the identity it runs against. A returning customer who
    // checks out logged-out and types a second number — a new phone, a typo, a
    // partner's mobile — used to miss the phone match, fall through to
    // provisioning, and die on the email-unique check with "That email is
    // already in use": no overlap message, no way forward. Matching either
    // channel resolves them to the account they already have, so the guard runs
    // and they are told which date their current plan runs to.
    //
    // Both columns are uniquely indexed (users_email_unique, users_phone_unique)
    // and both values are normalised above — email lowercased by emailSchema,
    // phone to E.164 — so this cannot match on formatting variance alone.
    //
    // Every path that resolves an existing account (session owner, or a
    // phone/email match below) is scoped to role="user" — a staff/admin
    // account must never become an order's owner, whether by a signed-in
    // staff session or a guest checkout that happens to share their phone/
    // email. STAFF_ACCOUNT_MESSAGE is what a real person sees when that
    // happens; provisionCustomerByPhone throws the same message for the
    // guest-checkout collision case.
    if (ownerId) {
      const [ownerRow] = await tx.select({ role: users.role }).from(users).where(eq(users.id, ownerId)).limit(1);
      if (ownerRow && ownerRow.role !== "user") throw new ValidationError(STAFF_ACCOUNT_MESSAGE);
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

    // The plan's main address: a picked saved address (ownership-checked), else the typed
    // contact address saved to the customer's book (first one becomes their default).
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
        deliveryInstructions: savedAddress.deliveryInstructions,
        lat: savedAddress.lat == null ? null : Number(savedAddress.lat),
        lng: savedAddress.lng == null ? null : Number(savedAddress.lng),
      };
      if (movedPostal) zoneRow = await findZone(snapshot.zones, input.contact, orgId);
    }

    const organizationId = await resolveBrandOrgId(tx);
    await assertStartNotHoliday(tx, organizationId, input.selections.startDate);

    // Reject a new order whose delivery window overlaps a subscription this
    // customer already has running: "active"/"paused" orders reserve real
    // calendar days (materializeDeliveries wrote rows for them), so a second
    // order starting inside that reserved band would double-book delivery.
    // Waitlisted orders never materialize deliveries (out of zone), so they
    // don't occupy any dates and are excluded from this check, as are cancelled/completed.
    await assertNoPlanOverlap(tx, {
      userId,
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

    // Customer lane: the best valid combination of auto-apply coupons plus an
    // optional manual code, re-resolved server-side (never trusting a client
    // amount). Method-gated coupons are filtered via paymentMethodId.
    const best = await couponsService.resolveBestCoupons({
      subtotal: postCatalog,
      planType: plan.planType,
      userId,
      paymentMethodId,
      manualCode: input.couponCode,
      manualCodes: input.couponCodes,
    });
    // A code that was explicitly entered but is invalid / expired / ineligible
    // fails the order with the reason — the auto set would otherwise silently drop
    // it. Auto-apply coupons never trigger this.
    const typedError = best.manualErrors[0];
    if (typedError) throw new ValidationError(`${typedError.code}: ${typedError.error}`);

    // Re-distribute every kept line against the running remaining subtotal so the
    // summed redemption amounts can never exceed the order subtotal.
    const remainingAfter = () => Math.max(0, Math.round((postCatalog - adjustments.reduce((sum, a) => sum + a.amount, 0) + Number.EPSILON) * 100) / 100);
    for (const r of best.redemptions) {
      const amount = Math.min(r.amount, remainingAfter());
      if (amount <= 0) continue;
      adjustments.push({ label: `${r.coupon.name} (${r.coupon.code})`, amount });
      redemptions.push({ coupon: r.coupon, amount, redeemedBy: createdBy });
    }

    // Staff lane last: it stacks on every coupon, and its ceilings are judged against
    // what the customer still pays.
    if (input.repCoupon) {
      // One staff discount per order: each lane is capped per discount, so a staff code and a
      // rep discount together would give the customer two ceilings' worth.
      if (best.redemptions.some((r) => r.coupon.kind === "rep_code")) {
        throw new ValidationError("Only one staff discount per order: remove the staff code or the rep discount");
      }
      // Hard gate: a discount amount with no acting staff member is rejected.
      if (createdBy == null) throw new ValidationError("A rep discount requires an acting staff member");
      const line = await couponsService.validateRepCoupon(input.repCoupon.code, {
        subtotal: remainingAfter(),
        requestedAmount: input.repCoupon.requestedAmount,
        actorId: createdBy,
        planType: plan.planType,
        userId,
      });
      if (line.amount > 0) {
        adjustments.push(line);
        redemptions.push({ coupon: await couponsService.findByCode(input.repCoupon.code), amount: line.amount, redeemedBy: createdBy });
      }
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
      const remaining = Math.max(0, Math.round((postCatalog - priorDiscount + Number.EPSILON) * 100) / 100);
      if (remaining > 0) {
        const rate = await walletService.activeRate(currency);
        // Admin limit on the share of the PRE-TAX subtotal coins may cover
        // (NULL = unlimited). Bounded by `remaining` too, so coins can never
        // take the order below zero. capRedemption clamps rather than rejects:
        // asking for more coins than the cap allows spends only what the cap buys.
        const maxPct = await getMaxCoinPctOfSubtotal();
        const pctCap = maxPct == null
          ? Infinity
          : Math.round((postCatalog * (maxPct / 100) + Number.EPSILON) * 100) / 100;

        const walletBalance = await walletService.balance(userId);
        const maxRedeemPct = await getMaxCoinRedeemPctOfBalance();
        const walletPctCap = maxRedeemPct == null ? Infinity : Math.floor(walletBalance * (maxRedeemPct / 100));
        const requestedCoins = Math.min(input.coins, walletPctCap);
        coinRedemption = await lockAndQuoteCoinRedemption(tx, {
          userId, coins: requestedCoins, rate, cap: Math.min(remaining, pctCap),
        });
        if (coinRedemption.currencyValue > 0) {
          adjustments.push({ label: `Coins (${coinRedemption.coinsSpent})`, amount: coinRedemption.currencyValue });
        }
      }
    }

    const pricing = priceSubscription(input.selections, pricingCatalog, adjustments, taxes);

    // Snapshot is the immutable receipt. For deferred settlement, pending
    // redemptions ride along until staff verify — then redeem + clear.
    const pricingSnapshot: OrderPricingSnapshot = {
      ...pricing,
      paymentMethodId,
      taxProvince,
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

    const status: OrderStatusValue = zoneRow ? "active" : "waitlisted";

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
        currentOwner: input.currentOwner ?? null,
        createdBy,
        organizationId,
      })
      .returning();

    // Structured counterpart to the addon lines already inside pricingSnapshot —
    // see orderAddons' comment in db/schema/orders.ts. pricingCatalog.addons is
    // already the buildPricingCatalog-validated (eligible, priced, qty-clamped)
    // resolution of input.selections.addonSelections, so no re-validation needed here.
    if (pricingCatalog.addons.length) {
      await tx.insert(orderAddons).values(orderAddonValues(order.id, pricingCatalog.addons, pricing.tiffinCount, organizationId));
    }

    // Start immediately: in-zone orders materialize deliveries now, even when
    // payment is still awaiting. UI tells the customer delivery begins once
    // payment is confirmed; unpaid days can be moved ahead later.
    if (order.status === "active") {
      // The order id is not visible to any other transaction yet; the lock is the contract applyHolidaysToOrder expects.
      await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
      await materializeDeliveries(tx, order);
      await applyHolidaysToOrder(tx, order, createdBy);
    }

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

    return { deploymentId, publicId: order.publicId };
  });

  publishAnalyticsLive();

  return { deploymentId: txResult.deploymentId, publicId: txResult.publicId };
}

const METHOD_LABEL: Record<(typeof payments.$inferSelect)["method"], string> = {
  etransfer: "Interac e-Transfer",
  cash: "Cash",
  manual: "Manual",
  simulated: "Simulated",
};

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
    method: METHOD_LABEL[pay.method],
  };
}

// Staff settles a real-method payment: credits the ledger, redeems any deferred
// coupons from the pricing snapshot, awards earn-back coins, and marks paid.
// Accepts awaiting_payment (e.g. cash confirmed without a customer claim) and
// pending_verification (after a claim). Idempotent against already-paid rows.
export async function verifyPayment(
  paymentPublicId: string,
  opts: { actorId?: string | null } = {},
): Promise<void> {
  let missedStops: OptimoSyncedRow[] = [];
  const userPublicId = await db.transaction(async (tx) => {
    // Locked so a second, concurrent verify waits, then sees "paid" and stops.
    const [pay] = await tx.select().from(payments).where(eq(payments.publicId, paymentPublicId)).for("update").limit(1);
    if (!pay) throw new NotFoundError("Payment not found");
    if (pay.status === "paid" || pay.status === "simulated_paid") return null;
    if (pay.status !== "awaiting_payment" && pay.status !== "pending_verification") {
      throw new ValidationError(`Payment cannot be verified from status ${pay.status}`);
    }

    // Same lock order as cancel and activate (order advisory lock, then the
    // customer), so a verify racing either one waits instead of deadlocking, and
    // reads the order's status only after a concurrent activate has committed.
    await tx.execute(sql`select pg_advisory_xact_lock(${pay.orderId})`);
    const [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId)).limit(1);
    if (!order?.userId) throw new NotFoundError("Order not found");
    await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${order.userId} FOR UPDATE`);

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
      const settled = await settleCoinReservation(tx, { userId: order.userId, orderId: order.id });
      if (settled.status === "none") {
        // An order placed before checkout holds existed: nothing was reserved,
        // so debit now exactly as this path always did.
        await commitCoinRedemption(tx, {
          userId: order.userId,
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
          userId: order.userId,
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

    if (order.status === "active") missedStops = await shiftMissedDeliveries(tx, order.id, actorInternalId);

    const [user] = await tx.select({ publicId: users.publicId, name: users.name }).from(users).where(eq(users.id, order.userId)).limit(1);
    const [freq] = await tx.select({ weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);

    await enqueueNotification(tx, {
      event: "payment_approved",
      recipientId: order.userId,
      title: "Payment confirmed",
      body: `Your payment of ${formatMoney(Number(pay.amount))} for order ${order.deploymentId} is confirmed.`,
      href: "/me/wallet?tab=bills",
      data: {
        payment: {
          ...paymentTemplateVars(pay, order.deploymentId, user?.name),
          startDate: order.startDate,
          durationWeeks: order.durationWeeks,
          deliveryDays: (freq?.weekdays ?? []).join(", "),
          eatingDays: (order.eatingDays ?? []).join(", "),
        },
      },
      dedupeKey: `payment_approved:${pay.publicId}`,
    });

    // Waitlisted orders earn in activate instead, once they go active.
    if (order.status === "active") {
      await awardReferral(tx, order, "paid");
      await awardOrderCoins(tx, order, "paid");
    }

    return user?.publicId ?? null;
  });

  publishAnalyticsLive();
  await deleteFromOptimoRouteBestEffort(missedStops);

  // Refreshes the customer's wallet/bills views.
  if (userPublicId) publishUserRefresh(userPublicId);
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

    // Clawback runs in the SAME transaction as the payment-status flip: both
    // commit or roll back together, so a crash between them can never leave a
    // refunded order whose coins were never reversed. reverseCoinAward only
    // needs a row lock on `users` (via lockUser), which this transaction can
    // acquire without conflicting with anything else already held here.
    if (order.userId) {
      await reverseCoinAward(tx, {
        userId: order.userId,
        eventType: "order_activated",
        source: { type: "order", id: order.publicId },
      });
      await reverseReferral(tx, order);
      // Money back means coins back: a refunded order's spent coins return too.
      await reverseCoinRedemption(tx, { userId: order.userId, orderId: order.id });
    }
  });
  publishAnalyticsLive();
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

  // Once claimed the payment is in staff hands: no re-submit until they approve or reject it.
  if (pay.status !== "awaiting_payment" && pay.status !== "rejected") {
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
  publishAnalyticsLive();
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
  publishAnalyticsLive();
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

/** Any staff member flags an order the whole team should watch (always with why), or clears the flag.
 * Marking an already flagged order re-marks it: new note, new marker. Logged as an order note,
 * like updatePaymentReference. */
export async function setOrderLookOut(
  orderPublicId: string,
  on: boolean,
  note: string,
  actorId: bigint | null = null,
): Promise<void> {
  const reason = note.trim();
  if (!reason) throw new ValidationError(on ? "Add a note on what to look out for" : "Add a note on why it is being unmarked");
  if (reason.length > 300) throw new ValidationError("Keep the note under 300 characters");
  await db.transaction(async (tx) => {
    // Row lock: two staff marking at once log one "Marked" and one "note changed", not two "Marked".
    const [order] = await tx.select({ id: orders.id, lookOutAt: orders.lookOutAt, organizationId: orders.organizationId })
      .from(orders).where(eq(orders.publicId, orderPublicId)).limit(1).for("update");
    if (!order) throw new NotFoundError("Order not found");
    if (!on && order.lookOutAt == null) return;

    await tx
      .update(orders)
      .set(on ? { lookOutAt: Date.now(), lookOutBy: actorId, lookOutNote: reason } : { lookOutAt: null, lookOutBy: null, lookOutNote: null })
      .where(eq(orders.id, order.id));
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: !on ? `Look out for cleared: ${reason}` : order.lookOutAt == null ? `Marked look out for: ${reason}` : `Look out for note changed: ${reason}`,
      createdBy: actorId,
      organizationId: order.organizationId,
    });
  });
}

const TICKET_NOTE = "Support ticket: ";

/** A support ticket puts its order on the look-out list. A flag staff already set is left alone. */
export async function lookOutForTicket(orderId: bigint, subject: string): Promise<void> {
  const note = `${TICKET_NOTE}${subject}`.slice(0, 300);
  const [flagged] = await db
    .update(orders)
    .set({ lookOutAt: Date.now(), lookOutBy: null, lookOutNote: note })
    .where(and(eq(orders.id, orderId), isNull(orders.lookOutAt)))
    .returning({ id: orders.id });
  if (flagged) await db.insert(orderActivities).values({ orderId, type: "note", note: `Marked look out for: ${note}` });
}

/**
 * A resolved ticket takes its order back off the list, but only a flag a ticket set: one staff
 * marked or edited carries their name and stays. Another ticket still open on the order keeps it.
 */
export async function clearTicketLookOut(orderId: bigint): Promise<void> {
  const [cleared] = await db
    .update(orders)
    .set({ lookOutAt: null, lookOutBy: null, lookOutNote: null })
    .where(and(
      eq(orders.id, orderId),
      isNotNull(orders.lookOutAt),
      isNull(orders.lookOutBy),
      sql`starts_with(${orders.lookOutNote}, ${TICKET_NOTE})`,
      sql`not exists (select 1 from ${tickets} where ${tickets.orderId} = ${orderId} and ${tickets.status} not in ('resolved', 'closed'))`,
    ))
    .returning({ id: orders.id });
  if (cleared) await db.insert(orderActivities).values({ orderId, type: "note", note: "Look out for cleared: support ticket resolved" });
}

/** Flagged orders the caller can see, for the Orders tab badge. */
export async function countLookOutOrders(visible: "all" | string[]): Promise<number> {
  if (visible !== "all" && visible.length === 0) return 0;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(and(isNotNull(orders.lookOutAt), visible === "all" ? undefined : inArray(orders.organizationId, visible)));
  return count;
}

/** An order's last tiffin: its latest non-cancelled delivery row (the same rule `reservedEndDatesExclusive` uses). */
export const lastTiffinSql = sql<string | null>`(select max(${deliveries.deliveryDate}) from ${deliveries} where ${deliveries.orderId} = ${orders.id} and ${deliveries.status} <> 'cancelled')`;

/** The customer already has a later plan (pending, running or finished) starting after this one. */
export const renewedSql = sql<boolean>`exists (select 1 from ${orders} as next_order where next_order.user_id = ${orders.userId} and next_order.id <> ${orders.id} and next_order.status in ('pending', 'active', 'paused', 'completed') and next_order.start_date > ${orders.startDate})`;

/** ISO dates, both inclusive, in the app timezone. */
export type EndingWindow = { from: string; to: string };

/** Running plans whose last tiffin falls inside the window: the ones up for renewal. */
function endingWhere(w: EndingWindow) {
  return and(inArray(orders.status, ["active", "paused"]), sql`${lastTiffinSql} between ${w.from} and ${w.to}`);
}

/** Orders the badge reads as Payment review: same rule as `orderDisplayStatus`, over every payment row. */
function paymentReviewWhere() {
  return and(
    inArray(orders.status, ["active", "pending", "paused"]),
    sql`exists (select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${inArray(payments.status, [...PAYMENT_REVIEW_STATUSES])})`,
  );
}

async function countVisibleOrders(where: SQL | undefined, visible: "all" | string[]): Promise<number> {
  if (visible !== "all" && visible.length === 0) return 0;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(and(where, visible === "all" ? undefined : inArray(orders.organizationId, visible)));
  return count;
}

/** Running plans ending inside the window, for the Ending soon tab badge. */
export const countEndingOrders = (visible: "all" | string[], window: EndingWindow) => countVisibleOrders(endingWhere(window), visible);

/** Orders waiting on a payment claim or staff verification, for the Payment review tab badge. */
export const countPaymentReviewOrders = (visible: "all" | string[]) => countVisibleOrders(paymentReviewWhere(), visible);

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
        inArray(payments.status, ["awaiting_payment", "pending_verification", "rejected"]),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!pay) return null;
  return getClaimPaymentContext(pay.publicId);
}

export type OrderListRow = {
  publicId: string;
  deploymentId: string;
  fullName: string;
  city: string;
  planKey: string;
  status: string;
  /** Latest payment row status when present — drives the Payment review badge overlay. */
  paymentStatus: string | null;
  startDate: string;
  total: string;
  createdAt: number;
  ownerId: string | null;
  ownerName: string | null;
  trial: boolean;
  lookOut: boolean;
  lookOutNote: string | null;
  /** Set only on the Ending soon view. */
  lastTiffin: string | null;
  /** Ending soon view only: a later plan for the same customer already exists. */
  renewed: boolean;
};

export type OrderSortColumn = "name" | "deployment" | "status" | "start" | "total" | "created" | "flagged";

// Server-side unified filters (Condition) + offset pagination + unpaginated
// total — mirrors inquiriesService.listForPipeline. Status, name, id, and
// createdAt live on `orders`. Plan and meal-size tier resolve through a
// subquery (`ordersListResolver`) so the count stays on the base table. The rows query joins
// plans (inner, non-nullable FK — safe) and users (left, nullable
// currentOwner — display-only), but the count runs on the base `orders` table
// alone with the identical `where` so the nullable owner join can't inflate it.
// Client-scoping: which orgs a session may see. super_admin bypasses to "all";
// everyone else is scoped to their `member` rows — zero rows means zero orders,
// never the whole table (see @foundry/auth resolveVisibleOrgIds).
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

/** Staff actions that take an order public id: refuse an order outside the caller's organizations. */
export async function assertOrderVisible(publicId: string, visible: "all" | string[]): Promise<void> {
  if (visible !== "all" && visible.length === 0) throw new NotFoundError("Order not found");
  const [row] = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.publicId, publicId), visible === "all" ? undefined : inArray(orders.organizationId, visible)))
    .limit(1);
  if (!row) throw new NotFoundError("Order not found");
}

// Actions that take a delivery or payment id resolve the order from that row, never from an
// order id the client sent alongside it.
export async function assertDeliveryVisible(deliveryPublicId: string, visible: "all" | string[]): Promise<void> {
  const [row] = await db.select({ publicId: orders.publicId }).from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId)).where(eq(deliveries.publicId, deliveryPublicId)).limit(1);
  if (!row) throw new NotFoundError("Order not found");
  await assertOrderVisible(row.publicId, visible);
}

export async function assertPaymentVisible(paymentPublicId: string, visible: "all" | string[]): Promise<void> {
  const [row] = await db.select({ publicId: orders.publicId }).from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.publicId, paymentPublicId)).limit(1);
  if (!row) throw new NotFoundError("Order not found");
  await assertOrderVisible(row.publicId, visible);
}

function filterValues(f: FilterCondition): string[] {
  return f.operator === "in" ? (f.value as string[]) : [String(f.value)];
}

// Plan and meal-size tier live on joined tables. The URL carries the plan key
// or tier name; a subquery resolves it so the orders list can open the rows
// behind an analytics figure without putting an internal id in the link.
function ordersListResolver() {
  const base = columnResolver({
    status: orders.status,
    fullName: orders.fullName,
    deploymentId: orders.deploymentId,
    createdAt: orders.createdAt,
  });
  return (f: FilterCondition) => {
    if (f.field === "plan") {
      return inArray(
        orders.planId,
        db.select({ id: plans.id }).from(plans).where(inArray(plans.key, filterValues(f))),
      );
    }
    if (f.field === "tier") {
      return inArray(
        orders.mealSizeId,
        db
          .select({ id: mealSizes.id })
          .from(mealSizes)
          .where(
            and(
              inArray(mealSizes.tier, filterValues(f) as ("budget" | "medium" | "premium")[]),
              eq(mealSizes.custom, false),
            ),
          ),
      );
    }
    // Orders carry no email of their own; search matches the account's.
    if (f.field === "email") {
      return inArray(
        orders.userId,
        db.select({ id: users.id }).from(users).where(ilike(users.email, String(f.value))),
      );
    }
    return base(f);
  };
}

export async function listOrdersPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<OrderSortColumn> = { column: "created", dir: "desc" },
  visible: "all" | string[],
  /** missedAsOf: today in the app timezone; keeps orders with a missed delivery before it. */
  opts: { lookOutOnly?: boolean; ending?: EndingWindow; paymentReview?: boolean; missedAsOf?: string } = {},
): Promise<Page<OrderListRow>> {
  const where = and(
    conditionToSql(condition, ordersListResolver()),
    opts.lookOutOnly ? isNotNull(orders.lookOutAt) : undefined,
    opts.ending ? endingWhere(opts.ending) : undefined,
    opts.paymentReview ? paymentReviewWhere() : undefined,
    opts.missedAsOf ? hasMissedDeliveries(opts.missedAsOf) : undefined,
    visible === "all" ? undefined : inArray(orders.organizationId, visible),
  );

  const SORT_COL = {
    name: orders.fullName,
    deployment: orders.deploymentId,
    status: orders.status,
    start: orders.startDate,
    total: orders.total,
    created: orders.createdAt,
    flagged: orders.lookOutAt,
  } as const;
  const col = SORT_COL[sort.column] ?? orders.createdAt;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: orders.id,
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
        trialLength: orders.trialLength,
        lookOutAt: orders.lookOutAt,
        lookOutNote: orders.lookOutNote,
        lastTiffin: opts.ending ? lastTiffinSql : sql<null>`null`,
        renewed: opts.ending ? renewedSql : sql<boolean>`false`,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(users, eq(orders.currentOwner, users.id))
      .where(where)
      // Soonest-ending first, so today's last tiffins top the renewal list.
      .orderBy(...(opts.ending ? [asc(lastTiffinSql), asc(orders.id)] : pageOrder(sort.dir, col, orders.id)))
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .where(where),
  ]);

  // One payment status per order (newest wins) for the admin badge overlay — keep
  // the list query free of a multiplying payments join.
  const paymentByOrder = new Map<string, string>();
  if (rows.length > 0) {
    const pays = await db
      .select({ orderId: payments.orderId, status: payments.status, createdAt: payments.createdAt })
      .from(payments)
      .where(inArray(payments.orderId, rows.map((r) => r.id)))
      .orderBy(desc(payments.createdAt));
    for (const p of pays) {
      const key = p.orderId.toString();
      if (!paymentByOrder.has(key)) paymentByOrder.set(key, p.status);
    }
  }

  const items: OrderListRow[] = rows.map((r) => ({
    publicId: r.publicId,
    deploymentId: r.deploymentId,
    fullName: r.fullName,
    city: r.city,
    planKey: r.planKey,
    status: r.status,
    paymentStatus: paymentByOrder.get(r.id.toString()) ?? null,
    startDate: r.startDate,
    total: r.total,
    createdAt: r.createdAt,
    ownerId: r.ownerId ?? null,
    ownerName: r.ownerName ?? null,
    trial: r.trialLength != null,
    lookOut: r.lookOutAt != null,
    lookOutNote: r.lookOutNote,
    lastTiffin: r.lastTiffin,
    renewed: r.renewed,
  }));
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
  frequencyName: string;
  frequencyWeekdays: string[] | null;
  mealSizeName: string;
  payments: OrderPaymentDetail[];
  /** Add-ons sold on the order; each qty is an extra row in every tiffin. */
  addons: { key: string; name: string; category: string; qty: number; pricePerTiffin: string }[];
};

// Same org scoping as listOrdersPage (see @foundry/auth resolveVisibleOrgIds). A
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
      frequencyName: deliveryFrequencies.name,
      frequencyWeekdays: deliveryFrequencies.weekdays,
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
  const addons = await db
    .select({ key: orderAddons.addonKey, name: orderAddons.addonName, category: orderAddons.category, qty: orderAddons.qty, pricePerTiffin: orderAddons.pricePerTiffin })
    .from(orderAddons)
    .where(eq(orderAddons.orderId, row.order.id))
    .orderBy(asc(orderAddons.id));
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
    addons,
    planName: row.planName,
    planKey: row.planKey,
    frequencyKey: row.frequencyKey,
    frequencyName: row.frequencyName,
    frequencyWeekdays: row.frequencyWeekdays,
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
    await db.transaction(async (tx) => {
      // Advisory lock before the orders row is written (every delivery writer takes it first).
      await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
      // Waitlisted orders skipped the overlap guard at checkout (they held no days); now they will.
      if (order.userId != null) {
        await assertNoPlanOverlap(tx, { userId: order.userId, startDate: order.startDate, durationWeeks: order.durationWeeks, excludeOrderId: order.id });
      }
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
      await applyHolidaysToOrder(tx, row, actorId);
      // An unverified real-method payment earns later, in verifyPayment.
      const [pay] = await tx
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.orderId, row.id))
        .limit(1);
      await awardReferral(tx, row, pay?.status ?? null);
      await awardOrderCoins(tx, row, pay?.status ?? null);
    });

    publishAnalyticsLive();
  }

  // A plan migrated from WordPress (db/seed-customers.ts) waits as `pending` with its
  // prepaid balance and no deliveries while WordPress still delivers. Staff start it on the
  // day the customer leaves WordPress: the balance is scheduled from that date, bounded to
  // the exact count (materializeDeliveries only fills whole weeks). No payment or coin
  // award: it was paid on WordPress.
  async startMigrated(publicId: string, startDate: string): Promise<void> {
    const actorId = await this.currentUserId();
    const { timezone, cutoffHour } = await getAppSettings();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < zonedDateIso(Date.now(), timezone)) {
      throw new ValidationError("Pick today or a later date");
    }
    await db.transaction(async (tx) => {
      // Advisory lock before the row lock (deliveries.service takes it first); the id comes from a plain read.
      const [idRow] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId)).limit(1);
      if (!idRow) throw new NotFoundError(`Order not found: ${publicId}`);
      await tx.execute(sql`select pg_advisory_xact_lock(${idRow.id})`);
      const [order] = await tx.select().from(orders).where(eq(orders.publicId, publicId)).for("update").limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      if (order.status !== "pending" || !order.deploymentId.startsWith("wc-")) {
        throw new ValidationError("Only a pending plan migrated from WordPress can be started here");
      }
      await assertStartNotHoliday(tx, order.organizationId, startDate);
      const [freq] = await tx.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies)
        .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
      if (!freq) throw new ValidationError("Delivery frequency not found");
      const rows = buildBoundedDeliveryRows({
        startDate,
        trips: tripsFor(freq.key, (order.eatingDays ?? []) as DayOfWeek[]),
        persons: order.persons,
        targetTiffinCount: order.tiffinCount,
      }).map((r) => ({ ...r, cutoffAt: cutoffMsFor(r.deliveryDate, cutoffHour, timezone) }));
      if (!rows.length) throw new ValidationError("This plan has no tiffins left to schedule");
      if (rows[0]!.cutoffAt <= Date.now()) {
        throw new ValidationError(`The cutoff for ${rows[0]!.deliveryDate} has passed. Pick a later start date`);
      }
      if (order.userId != null) {
        // Bounded rows can run past durationWeeks; cover the span they actually occupy.
        const spanDays = Math.round((parseIsoDateUtc(rows.at(-1)!.deliveryDate).getTime() - parseIsoDateUtc(startDate).getTime()) / 86_400_000) + 1;
        await assertNoPlanOverlap(tx, { userId: order.userId, startDate, durationWeeks: Math.max(order.durationWeeks, Math.ceil(spanDays / 7)), excludeOrderId: order.id });
      }

      const [started] = await tx.update(orders).set({ status: "active", startDate, updatedBy: actorId, updatedAt: Date.now() })
        .where(eq(orders.id, order.id)).returning();
      await tx.insert(deliveries).values(rows.map((r) => ({
        orderId: order.id,
        deliveryDate: r.deliveryDate,
        status: "scheduled" as const,
        cutoffAt: r.cutoffAt,
        tiffinUnits: r.tiffinUnits,
        coversDates: r.coversDates,
        organizationId: order.organizationId,
      })));
      await applyHolidaysToOrder(tx, started!, actorId);
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "activated",
        fromStatus: "pending",
        toStatus: "active",
        note: `Started from WordPress on ${startDate}: ${order.tiffinCount} tiffins, last ${rows.at(-1)!.deliveryDate}`,
        createdBy: actorId,
      });
    });
    publishAnalyticsLive();
  }

  /**
   * Why this order's start date can't move, or null when it can: nothing has
   * happened yet. Every delivery is still scheduled before its cutoff and the
   * customer hasn't paused, skipped, moved, swapped, added tiffins or picked dishes,
   * so its deliveries can be rebuilt from a new start without losing anything.
   */
  async startChangeBlocker(orderId: bigint, status: string, tx: Pick<typeof db, "select"> = db): Promise<string | null> {
    if (status !== "active" && status !== "pending" && status !== "waitlisted") return "Only a plan that hasn't started can move its start date";
    const all = await tx.select({ id: deliveries.id, status: deliveries.status, cutoffAt: deliveries.cutoffAt, holidayId: deliveries.holidayId })
      .from(deliveries).where(eq(deliveries.orderId, orderId));
    const now = Date.now();
    // A row a holiday closed was paused by the kitchen, not the customer; the rebuild re-applies holidays.
    const rows = all.filter((d) => !(d.status === "paused" && d.holidayId != null));
    if (rows.some((d) => d.cutoffAt <= now)) return "This plan has started: its first delivery is past the cutoff";
    if (rows.some((d) => d.status !== "scheduled")) return "The customer has already skipped or paused a delivery";
    const ids = all.map((d) => d.id);
    const touched = await Promise.all([
      tx.select({ id: subscriptionPauses.id }).from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId)).limit(1),
      tx.select({ id: mealSelections.id }).from(mealSelections).where(eq(mealSelections.orderId, orderId)).limit(1),
      ids.length ? tx.select({ id: deliveryMoves.id }).from(deliveryMoves).where(eq(deliveryMoves.orderId, orderId)).limit(1) : [],
      ids.length ? tx.select({ id: deliveryCategorySwaps.id }).from(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.deliveryId, ids)).limit(1) : [],
      ids.length ? tx.select({ id: deliveryExtraTiffins.id }).from(deliveryExtraTiffins).where(inArray(deliveryExtraTiffins.deliveryId, ids)).limit(1) : [],
    ]);
    if (touched.some((r) => r.length > 0)) return "The customer has already changed this plan's deliveries or dishes";
    return null;
  }

  // Admin: move a plan's start before it starts. Its untouched deliveries are rebuilt
  // from the new date. An eating-days plan lays out its paid tiffin count rather than
  // whole weeks: changeEatingDays stretches durationWeeks to the plan's calendar span,
  // so weeks x days no longer equals what was bought.
  async changeStartDate(publicId: string, startDate: string): Promise<void> {
    const actorId = await this.currentUserId();
    const { timezone, cutoffHour } = await getAppSettings();
    await db.transaction(async (tx) => {
      // Advisory lock before the row lock (deliveries.service takes it first); the id comes from a plain read.
      const [idRow] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId)).limit(1);
      if (!idRow) throw new NotFoundError(`Order not found: ${publicId}`);
      await tx.execute(sql`select pg_advisory_xact_lock(${idRow.id})`);
      const [order] = await tx.select().from(orders).where(eq(orders.publicId, publicId)).for("update").limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      const blocker = await this.startChangeBlocker(order.id, order.status, tx);
      if (blocker) throw new ValidationError(blocker);
      if (startDate === order.startDate) return;
      const today = appToday(timezone, cutoffHour);
      if (order.trialLength != null) {
        assertTrialStart(startDate, order.trialWeekdays ?? [], today);
      } else {
        const [plan] = await tx.select({ allowedStartDays: plans.allowedStartDays }).from(plans).where(eq(plans.id, order.planId)).limit(1);
        validateStartDate(startDate, plan?.allowedStartDays ?? [], today);
      }
      await assertStartNotHoliday(tx, order.organizationId, startDate);
      // Waitlisted/pending plans hold no days yet; they meet the guard when they activate.
      if (order.userId != null && (order.status === "active" || order.status === "paused")) {
        await assertNoPlanOverlap(tx, { userId: order.userId, startDate, durationWeeks: order.durationWeeks, excludeOrderId: order.id });
      }

      const [moved] = await tx.update(orders).set({ startDate, updatedBy: actorId, updatedAt: Date.now() })
        .where(eq(orders.id, order.id)).returning();
      const [had] = await tx.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
      if (had) {
        await tx.delete(deliveries).where(eq(deliveries.orderId, order.id));
        const bounded = order.trialLength == null && !!order.eatingDays?.length;
        if (bounded) {
          const [freq] = await tx.select({ key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies)
            .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
          if (!freq) throw new ValidationError("Delivery frequency not found");
          const trips = planWeek(
            orderDeliveryDays({ frequencyKey: freq.key, weekdays: freq.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false }),
            order.eatingDays as DayOfWeek[],
          );
          if (!trips) throw new ValidationError("An eating day falls before the first delivery day of this frequency");
          const rows = buildBoundedDeliveryRows({ startDate, trips, persons: order.persons, targetTiffinCount: order.tiffinCount });
          if (!rows.length) throw new ValidationError("This plan has no tiffins left to schedule");
          await tx.insert(deliveries).values(rows.map((r) => ({
            ...r,
            orderId: order.id,
            status: "scheduled" as const,
            cutoffAt: cutoffMsFor(r.deliveryDate, cutoffHour, timezone),
            organizationId: order.organizationId,
          })));
        } else {
          await materializeDeliveries(tx, moved!);
        }
        await applyHolidaysToOrder(tx, moved!, actorId);
        const placed = await tx.select({ deliveryDate: deliveries.deliveryDate, cutoffAt: deliveries.cutoffAt }).from(deliveries)
          .where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
        const first = placed[0];
        if (first && first.cutoffAt <= Date.now()) {
          throw new ValidationError(`The cutoff for ${first.deliveryDate} has passed. Pick a later start date`);
        }
        if (bounded && placed.length) {
          // The overlap guard reads durationWeeks: keep it at the span these rows occupy.
          const spanDays = Math.round((parseIsoDateUtc(placed.at(-1)!.deliveryDate).getTime() - parseIsoDateUtc(startDate).getTime()) / 86_400_000) + 1;
          await tx.update(orders).set({ durationWeeks: Math.max(1, Math.ceil(spanDays / 7)) }).where(eq(orders.id, order.id));
        }
      }
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "note",
        note: `Start date moved from ${order.startDate} to ${startDate}`,
        createdBy: actorId,
        organizationId: order.organizationId,
      });
    });
    publishAnalyticsLive();
  }

  // Admin: change which days the customer eats. The delivery days (frequency) and the tiffin
  // balance stay as they are; only deliveries nobody has touched are laid out again, so the
  // last delivery date moves. Delivered, held, moved, swapped, re-addressed and routed rows
  // keep their date and the open tiffins are laid around them; only a moved tiffin left after
  // the new last day is brought forward to follow it.
  async changeEatingDays(publicId: string, days: DayOfWeek[]): Promise<void> {
    const actorId = await this.currentUserId();
    const { timezone, cutoffHour, minTiffinsPerWeek, maxTiffinsPerWeek } = await getAppSettings();
    const label = (d: readonly string[]) => d.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(", ");
    await db.transaction(async (tx) => {
      // Advisory lock before the row lock (deliveries.service takes it first); the id comes from a plain read.
      const [idRow] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId)).limit(1);
      if (!idRow) throw new NotFoundError(`Order not found: ${publicId}`);
      await tx.execute(sql`select pg_advisory_xact_lock(${idRow.id})`);
      const [order] = await tx.select().from(orders).where(eq(orders.publicId, publicId)).for("update").limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      if (order.status !== "active" && order.status !== "paused" && order.status !== "pending") {
        throw new ValidationError("Eating days can only change on a plan that is running or waiting to start");
      }
      if (order.trialLength != null) throw new ValidationError("A trial's days come from its trial schedule");

      // WordPress plans all ride the 5-day route; one imported as MWF moves onto it here.
      const [freq] = await tx.select({ id: deliveryFrequencies.id, key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies)
        .where(order.deploymentId.startsWith("wc-") ? eq(deliveryFrequencies.key, "5_day") : eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
      if (!freq) throw new ValidationError("Delivery frequency not found");
      const toFiveDay = freq.id !== order.frequencyId;
      const frequency = { frequencyKey: freq.key, weekdays: freq.weekdays as DayOfWeek[] | null };
      const deliveryDays = orderDeliveryDays({ ...frequency, includeSaturday: false, includeSunday: false });
      const err = eatingDaysError(deliveryDays, days, { min: minTiffinsPerWeek, max: maxTiffinsPerWeek })
        ?? weekendDaysError(days, await mealSizeServesWeekends(order.mealSizeId, tx));
      if (err) throw new ValidationError(err);
      const trips = planWeek(deliveryDays, days)!;
      const next = trips.flatMap((t) => t.days);
      const before = (order.eatingDays as DayOfWeek[] | null)
        ?? orderDeliveryDays({ ...frequency, includeSaturday: order.includeSaturday, includeSunday: order.includeSunday });
      if (before.join() === next.join() && !toFiveDay) return;

      const rows = await tx.select().from(deliveries).where(eq(deliveries.orderId, order.id));
      const ids = rows.map((r) => r.id);
      const [swaps, extras, moves] = ids.length ? await Promise.all([
        tx.select({ id: deliveryCategorySwaps.deliveryId }).from(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.deliveryId, ids)),
        tx.select({ id: deliveryExtraTiffins.deliveryId }).from(deliveryExtraTiffins).where(inArray(deliveryExtraTiffins.deliveryId, ids)),
        tx.select({ a: deliveryMoves.fromDeliveryId, b: deliveryMoves.toDeliveryId }).from(deliveryMoves).where(eq(deliveryMoves.orderId, order.id)),
      ]) : [[], [], []];
      const linked = (r: (typeof rows)[number]) => [r.mergedIntoDeliveryId, r.makeupForDeliveryId, r.complimentaryForDeliveryId];
      const edited = new Set([...swaps.map((x) => x.id), ...extras.map((x) => x.id)]);
      const tied = new Set([...edited, ...moves.flatMap((x) => [x.a, x.b]), ...rows.flatMap(linked)]);
      const now = Date.now();
      const open = rows.filter((r) => r.status === "scheduled" && r.cutoffAt > now && !r.routeSyncedAt && !r.optimoCompletionStatus
        && r.complimentaryNote == null && r.addressLine == null && r.addressId == null
        && linked(r).every((x) => x == null) && !tied.has(r.id)
        // A day a holiday added keeps its link to the closed day; the ordinary rows are laid around it.
        && r.holidayExtraForDeliveryId == null);
      const units = open.reduce((n, r) => n + r.tiffinUnits, 0);
      // A tiffin moved to its own later day and not touched since: it can follow the plan's end.
      const movable = rows.filter((r) => r.makeupForDeliveryId != null && r.status === "scheduled" && r.cutoffAt > now
        && !r.routeSyncedAt && !r.optimoCompletionStatus && r.complimentaryNote == null && r.addressLine == null && r.addressId == null
        && r.mergedIntoDeliveryId == null && r.complimentaryForDeliveryId == null && !edited.has(r.id)
        && (r.coversDates == null || (r.coversDates.length === 1 && r.coversDates[0] === r.deliveryDate))
        && !rows.some((o) => o.mergedIntoDeliveryId === r.id || o.complimentaryForDeliveryId === r.id));
      const pulled = new Map<bigint, string>();

      const laid: { deliveryDate: string; tiffinUnits: number; coversDates: string[]; cutoffAt: number }[] = [];
      if (units > 0) {
        // Never earlier than the first open delivery: a plan that hasn't started stays put.
        const start = open.map((r) => r.deliveryDate).sort()[0]!;
        const openIds = new Set(open.map((r) => r.id));
        const dropped = await dropVoidRows(tx, order.id, rows.filter((r) => r.status === "cancelled" && r.deliveryDate >= start).map((r) => r.deliveryDate));
        const kept = rows.filter((r) => !dropped.has(r.id));
        const taken = new Set(kept.filter((r) => !openIds.has(r.id) && r.deliveryDate >= start).map((r) => r.deliveryDate));
        // Padded so the rows skipped for a kept date never run the candidates short.
        const candidates = buildBoundedDeliveryRows({ startDate: start, trips, persons: order.persons, targetTiffinCount: units + (taken.size + 1) * 7 * order.persons });
        let left = units;
        for (const c of candidates) {
          if (left <= 0) break;
          if (taken.has(c.deliveryDate)) continue;
          const tiffinUnits = Math.min(c.tiffinUnits, left);
          laid.push({
            deliveryDate: c.deliveryDate,
            tiffinUnits,
            coversDates: c.coversDates.slice(0, Math.ceil(tiffinUnits / order.persons)),
            cutoffAt: cutoffMsFor(c.deliveryDate, cutoffHour, timezone),
          });
          left -= tiffinUnits;
        }
        if (left > 0) throw new ValidationError("Couldn't fit the remaining tiffins on these days");
        await tx.delete(deliveries).where(inArray(deliveries.id, [...openIds]));
        await tx.insert(deliveries).values(laid.map((r) => ({ ...r, orderId: order.id, status: "scheduled" as const, organizationId: order.organizationId })));

        // A moved tiffin parked after the old last day would be stranded when the plan gets
        // shorter: bring it up to the first free days after the new end. Never pushed later.
        // A cancelled row a move still points at survives dropVoidRows; it's no plan day either.
        const end = [...laid.map((r) => r.deliveryDate), ...kept.filter((r) => !openIds.has(r.id) && !movable.includes(r) && r.status !== "cancelled").map((r) => r.deliveryDate)].sort().at(-1)!;
        const free = candidates.map((c) => c.deliveryDate).filter((d) => d > end && !taken.has(d));
        const tail = movable.filter((r) => r.deliveryDate > end).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
        for (const [i, r] of tail.entries()) {
          const to = free[i];
          if (!to || to >= r.deliveryDate) break;
          await tx.update(deliveries).set({ deliveryDate: to, coversDates: r.coversDates && [to], cutoffAt: cutoffMsFor(to, cutoffHour, timezone) })
            .where(eq(deliveries.id, r.id));
          await tx.update(deliveryMoves).set({ toEatDate: to })
            .where(and(eq(deliveryMoves.toDeliveryId, r.id), eq(deliveryMoves.toEatDate, r.deliveryDate)));
          pulled.set(r.id, to);
        }
      }

      // The overlap guard reads durationWeeks; keep it covering a plan that now runs longer.
      const last = [...laid.map((r) => r.deliveryDate), ...rows.filter((r) => !open.includes(r) && r.status === "scheduled").map((r) => pulled.get(r.id) ?? r.deliveryDate)].sort().at(-1);
      const spanWeeks = last ? Math.ceil((Math.round((parseIsoDateUtc(last).getTime() - parseIsoDateUtc(order.startDate).getTime()) / 86_400_000) + 1) / 7) : 0;
      const [relaid] = await tx.update(orders).set({
        frequencyId: freq.id,
        eatingDays: next,
        includeSaturday: next.includes("sat"),
        includeSunday: next.includes("sun"),
        durationWeeks: Math.max(order.durationWeeks, spanWeeks),
        updatedBy: actorId,
        updatedAt: Date.now(),
      }).where(eq(orders.id, order.id)).returning();
      // The new layout can land a day on a declared holiday; close it like any other schedule write.
      await applyHolidaysToOrder(tx, relaid!, actorId);
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "note",
        note: (before.join() === next.join() ? `Delivery moved to 5 days a week, eating ${label(next)}` : `Eating days changed from ${label(before)} to ${label(next)}`)
          + (toFiveDay && before.join() !== next.join() ? ", delivery now 5 days a week" : "")
          + (laid.length ? `. ${units} upcoming tiffin${units === 1 ? "" : "s"} rescheduled` : "")
          + (pulled.size ? `, ${pulled.size} moved tiffin${pulled.size === 1 ? "" : "s"} brought forward` : "")
          + (laid.length ? `, last delivery ${last}` : ""),
        createdBy: actorId,
        organizationId: order.organizationId,
      });
    });
    publishAnalyticsLive();
  }

  // Switch-over day: start every WordPress plan still waiting, from `fromDate` or its own
  // later next-due date (a customer WordPress hasn't started yet keeps that start). One plan
  // failing (cutoff passed, no balance) never stops the rest; each result says what happened.
  async startAllMigrated(fromDate: string): Promise<{ started: number; failed: { deploymentId: string; error: string }[] }> {
    const waiting = await db.select({ publicId: orders.publicId, deploymentId: orders.deploymentId, startDate: orders.startDate })
      .from(orders)
      .where(and(eq(orders.status, "pending"), sql`${orders.deploymentId} like 'wc-%'`))
      .orderBy(asc(orders.deploymentId));
    let started = 0;
    const failed: { deploymentId: string; error: string }[] = [];
    for (const o of waiting) {
      try {
        await this.startMigrated(o.publicId, o.startDate > fromDate ? o.startDate : fromDate);
        started++;
      } catch (e) {
        failed.push({ deploymentId: o.deploymentId, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { started, failed };
  }

  // Terminal: cancel() has no reverse. activate()'s existing `if (c !== "waitlisted") throw`
  // guard already forbids reactivating a cancelled order — no separate check needed here.
  // Bypasses transition()/update() for the same reason activate() does: cancelDeliveries must
  // run in the SAME tx as the status flip (a crash between the two must roll back both), and
  // the lock must be taken before the pre-cancelled guard is evaluated (TOCTOU — see
  // skipDelivery in deliveries.service.ts for the same shape).
  async cancel(publicId: string): Promise<void> {
    const actorId = await this.currentUserId();
    let cancelledRows: Awaited<ReturnType<typeof cancelDeliveries>> = [];
    await db.transaction(async (tx) => {
      const [idRow] = await tx.select({ id: orders.id }).from(orders)
        .where(eq(orders.publicId, publicId)).limit(1);
      if (!idRow) throw new NotFoundError(`Order not found: ${publicId}`);
      await tx.execute(sql`select pg_advisory_xact_lock(${idRow.id})`);

      const [order] = await tx.select().from(orders).where(eq(orders.id, idRow.id)).limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      if (order.status === "cancelled") throw new ValidationError("Order is already cancelled");
      // Every tiffin on a completed plan is delivered; cancelling would void delivered rows.
      if (order.status === "completed") throw new ValidationError("This plan is over; there is nothing left to cancel");

      // Coins first (customer lock, then order), same order as payment verify takes them.
      // Coins the order earned are taken back. If it was never paid, coins held for it go
      // straight back; a paid order's spent coins stay spent (money back is refundOrder).
      if (order.userId) {
        await reverseCoinAward(tx, {
          userId: order.userId,
          eventType: "order_activated",
          source: { type: "order", id: order.publicId },
        });
        await reverseReferral(tx, order);
        const [pay] = await tx.select({ status: payments.status }).from(payments).where(eq(payments.orderId, order.id)).limit(1);
        const paid = pay?.status === "paid" || pay?.status === "simulated_paid";
        if (!paid) await reverseCoinRedemption(tx, { userId: order.userId, orderId: order.id });
      }

      const [row] = await tx.update(orders).set({ status: "cancelled", updatedBy: actorId })
        .where(eq(orders.id, order.id)).returning();
      cancelledRows = await cancelDeliveries(tx, row.id);
      await tx.insert(orderActivities).values({
        orderId: row.id,
        type: "cancelled",
        fromStatus: order.status,
        toStatus: "cancelled",
        createdBy: actorId,
      });
      await clearLookOutOnEnd(tx, row.id, "order cancelled");
    });
    publishAnalyticsLive();
    // External API call, deliberately outside the tx — see walletService.award above for the
    // same reasoning: a synced stop OptimoRoute still has must not survive a cancelled order.
    await deleteFromOptimoRouteBestEffort(cancelledRows);
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
    if (order.trialLength != null) throw new ValidationError("A trial can only have its dishes edited.");
    if (order.status !== "active") throw new ValidationError(`Cannot pause an order that is ${order.status}`);
    const actorId = await this.currentUserId();

    let until = window.until;
    if (window.indefinite) {
      const [last] = await db.select({ d: sql<string>`max(${deliveries.deliveryDate})` })
        .from(deliveries).where(eq(deliveries.orderId, order.id));
      until = last?.d ?? window.from;
    }
    // assertPauseAllowed is a fast-path UX check only — it reads-then-writes with no lock, so
    // two concurrent pause requests can both pass it. The subscription_pauses_one_open_unique
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
    // sit behind this early return, which meant every partial pause was invisible.
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
  // `fromDate` (ISO) resumes a pause partway: only paused days on/after it come back. Omit for a
  // full resume. The range pause has no entry point today (move-only deliveries).
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
export const startMigratedOrder = (publicId: string, startDate: string): Promise<void> => ordersService.startMigrated(publicId, startDate);
export const changeOrderStartDate = (publicId: string, startDate: string): Promise<void> => ordersService.changeStartDate(publicId, startDate);
export const changeOrderEatingDays = (publicId: string, days: DayOfWeek[]): Promise<void> => ordersService.changeEatingDays(publicId, days);
export const startAllMigratedOrders = (fromDate: string) => ordersService.startAllMigrated(fromDate);
export async function countMigratedWaiting(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(orders)
    .where(and(eq(orders.status, "pending"), sql`${orders.deploymentId} like 'wc-%'`));
  return row?.n ?? 0;
}
export const pauseOrder = (publicId: string, window: { from: string; until: string; indefinite?: boolean }): Promise<void> =>
  ordersService.pause(publicId, window);
export const resumeOrder = (publicId: string, actorId?: bigint, fromDate?: string): Promise<void> =>
  ordersService.resume(publicId, actorId, fromDate);
export const reassignOrder = (publicId: string, ownerId: string): Promise<void> =>
  ordersService.reassign(publicId, ownerId);

// Never puts a paused day back on the route (resume() used to, which undid the hold). A paused day
// past its cutoff becomes a hold. Then the old range-pause leftovers: an elapsed open window is
// closed, and an order those pauses flipped to "paused" goes back to active (that status means
// nothing now, so it does not wait for paused days to clear).
export async function autoResumeIfElapsed(orderId: bigint): Promise<void> {
  await lapseElapsedPausesSafe(orderId);
  const today = zonedDateIso(Date.now(), (await getAppSettings()).timezone);
  let changed = false;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const open = await tx.select({ id: subscriptionPauses.id, untilDate: subscriptionPauses.untilDate, isIndefinite: subscriptionPauses.isIndefinite })
      .from(subscriptionPauses).where(and(eq(subscriptionPauses.orderId, orderId), isNull(subscriptionPauses.resumedAt)));
    const elapsed = open.filter((r) => !r.isIndefinite && r.untilDate < today);
    if (elapsed.length > 0) {
      changed = true;
      await tx.update(subscriptionPauses).set({ resumedAt: new Date() }).where(inArray(subscriptionPauses.id, elapsed.map((r) => r.id)));
    }
    if (await retireLegacyPaused(tx, orderId)) changed = true;
  });
  if (changed) publishAnalyticsLive();
}
