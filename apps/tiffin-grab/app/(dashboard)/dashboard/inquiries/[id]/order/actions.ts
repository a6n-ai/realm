"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { ValidationError, emailSchema, phoneSchema, zonedDateIso } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { planDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { coupons, orders, users } from "@/db/schema";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { resolveSessionVisibleOrgIds, type CreateOrderInput } from "@/lib/services/orders.service";
import { couponsService, type AvailableCoupon } from "@/lib/services/coupons.service";
import { postCatalogSubtotal } from "@/lib/pricing/discounts";
import type { AppliedCoupon } from "@/app/(public)/subscribe/actions";
import { getAppSettings, getDiscountPolicy, getMaxCoinPctOfSubtotal, getMaxCoinRedeemPctOfBalance, getPaymentConfig } from "@/lib/services/app-settings.service";
import { capRedemption } from "@foundry/wallet";
import { coinCapMessage, quoteCoinCap } from "@/lib/pricing/coin-cap";
import { walletService } from "@/lib/services/wallet.service";
import { repAllowanceZone } from "@/lib/services/rep-allowance";
import { findMethod } from "@foundry/payments";
import { priceWithTax } from "@/lib/tax/checkout-taxes";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { earliestNewPlanStart, runningPlans, type RunningPlan } from "@/lib/services/order-window";
import { matchCustomerAccounts } from "@/lib/services/customers.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import type { DropOffValue } from "@/lib/catalog/drop-off";
import type { SavedAddress } from "@foundry/address";
import { stripePayLink } from "@/lib/payments/stripe";
import { addressService } from "@/lib/services/addresses.service";
import { dropOffsFor } from "@/lib/services/address-drop-off.service";
import { priceSubscription, type PricingLine, type PricingResult } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { quoteTrial } from "@/lib/trial/quote";


// Resolve the acting staff member's public_id to its internal bigint — the
// rep coupon's owner is matched against this, never a client-sent id.
async function actingStaffId(): Promise<bigint | null> {
  const publicId = (await getSession())?.user?.id;
  if (!publicId) return null;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

export type RepCouponInfo =
  | { available: false; reason: "disabled" | "none-today" | "used" | "expired" }
  | { available: true; code: string; name: string; capPct: number; capAmount: number };

// The acting rep's own valid daily coupon (the only one they own today). Drives
// the staff discount panel: the panel offers exactly this coupon and bounds the
// amount to the server-computed ceiling. Reps cannot apply anyone else's coupon.
export async function repCouponInfo(): Promise<RepCouponInfo> {
  await requireStaff();
  const policy = await getDiscountPolicy();
  if (!policy.repDaily.enabled) return { available: false, reason: "disabled" };

  const actorId = await actingStaffId();
  if (actorId == null) return { available: false, reason: "none-today" };

  const istDate = zonedDateIso(Date.now(), await repAllowanceZone());
  const [c] = await db
    .select({
      code: coupons.code,
      name: coupons.name,
      capPct: coupons.capPct,
      capAmount: coupons.capAmount,
      maxRedemptions: coupons.maxRedemptions,
      startsAt: coupons.startsAt,
      expiresAt: coupons.expiresAt,
    })
    .from(coupons)
    .where(
      and(
        eq(coupons.ownerUserId, actorId),
        eq(coupons.kind, "rep_daily"),
        eq(coupons.istDate, istDate),
        eq(coupons.active, true),
      ),
    )
    .limit(1);

  if (!c) return { available: false, reason: "none-today" };
  // The day's budget covers codes the rep issued as well as uses of this coupon.
  if ((await couponsService.repUsesToday(db, actorId, istDate)) >= (c.maxRedemptions ?? 1)) return { available: false, reason: "used" };
  const now = Date.now();
  if ((c.startsAt != null && now < c.startsAt) || (c.expiresAt != null && now > c.expiresAt)) {
    return { available: false, reason: "expired" };
  }
  return {
    available: true,
    code: c.code,
    name: c.name,
    capPct: c.capPct == null ? 0 : Number(c.capPct),
    capAmount: c.capAmount == null ? 0 : Number(c.capAmount),
  };
}

// Live price preview. When the rep applies their daily coupon with a requested
// amount, validate it server-side (owner == actor, allowance-day valid, unused) and
// clamp to the dual ceiling before folding it into adjustments. A coupon that no
// longer validates falls back to the un-discounted preview — the authoritative
// gate is createOrder.
export async function trialFormSettings() {
  await requireStaff();
  return getTrialSettings(await resolveRequestOrg());
}

export type CustomerOrderContext = {
  /** First day a new plan may start (after their running plans), or null. Same rule createOrder enforces. */
  renewFrom: string | null;
  /** The plans holding those days, earliest first. */
  plans: Omit<RunningPlan, "organizationId">[];
  /** The phone is one customer's and the email another's: createOrder will refuse this order. */
  conflict: boolean;
  /** Saved addresses with the drop-off picked under each. */
  addresses: (SavedAddress & { dropOff: DropOffValue | null })[];
};

const NO_CONTEXT: CustomerOrderContext = { renewFrom: null, plans: [], conflict: false, addresses: [] };

// An existing customer's running plans, renewal date and address book for the staff order
// form, or empty for a new customer. Matches the account by phone or email, as createOrder does.
// The accounts this phone or email matches that the acting staff member may know about.
async function knownCustomerAccounts(email: string, phone: string) {
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  // Unparseable input matches nobody: the form calls this while staff are still typing.
  const parsedEmail = emailSchema.safeParse(email.trim());
  const parsedPhone = phoneSchema().safeParse(phone);
  if (!parsedEmail.success && !parsedPhone.success) return { known: [], visible };
  const matches = await matchCustomerAccounts(db, parsedPhone.success ? parsedPhone.data : "", parsedEmail.success ? parsedEmail.data : "");
  // Only reveal anything about an account, even that one exists, to staff who can already
  // see one of its orders. An account they cannot see is dropped here, so it answers exactly
  // as a phone or email that matches nobody would: no conflict flag, and no change to what
  // is shown for the account they can see.
  if (visible === "all" || matches.length === 0) return { known: matches, visible };
  if (visible.length === 0) return { known: [], visible };
  const seen = await db.selectDistinct({ userId: orders.userId }).from(orders)
    .where(and(inArray(orders.userId, matches), inArray(orders.organizationId, visible)));
  return { known: matches.filter((id) => seen.some((s) => s.userId === id)), visible };
}

export async function customerOrderContext(email: string, phone = ""): Promise<CustomerOrderContext> {
  await requireStaff();
  const { known, visible } = await knownCustomerAccounts(email, phone);
  if (known.length > 1) return { ...NO_CONTEXT, conflict: true };
  const userId = known[0];
  if (!userId) return NO_CONTEXT;
  const [renewFrom, plans, saved] = await Promise.all([
    earliestNewPlanStart(db, userId),
    runningPlans(db, userId),
    addressService.list({ userId, orgId: await resolveRequestOrg() }),
  ]);
  const dropOffs = await dropOffsFor(saved.map((a) => a.publicId));
  return {
    renewFrom,
    // A plan in an organization this staff member cannot open still moves renewFrom, but is not listed.
    plans: plans
      .filter((p) => visible === "all" || (p.organizationId != null && visible.includes(p.organizationId)))
      .map(({ organizationId: _org, ...p }) => p),
    conflict: false,
    addresses: saved.map((a) => ({ ...a, dropOff: dropOffs[a.publicId] ?? null })),
  };
}

// Address types and drop-off strategies with their fees, as checkout offers them.
export async function orderFormDeliveryOptions() {
  await requireStaff();
  const client = toClientCatalog(await loadCatalogSnapshot());
  return { deliveryCharges: client.deliveryCharges ?? null, waivers: client.waivers ?? [] };
}

// Returned, not thrown: production strips a thrown action's message, and staff
// need the real reason the order can't be priced.
export async function previewPrice(
  input: CreateOrderInput,
  couponCode?: string,
  requestedAmount?: number,
  coins?: number | "max",
): Promise<ActionResult<StaffPricePreview>> {
  return runAction(() => quotePrice(input, couponCode, requestedAmount, coins));
}

// The customer coupon lane as createOrder will resolve it: what landed on the price, why the
// entered code did not, and the codes checkout suggests to this customer.
export type StaffCouponPreview = {
  applied: AppliedCoupon[];
  // Not tied to one typed code (the rep discount pairing rule).
  error?: string;
  // Per typed code: why it was refused, or why a valid one was left out of the best set.
  codeErrors: { code: string; error: string }[];
  notApplied: { code: string; reason: string }[];
  available: AvailableCoupon[];
};
/** The matched customer's wallet on this quote: what they hold, the most this order takes, and what is applied. */
export type StaffCoinPreview = { balance: number; maxCoins: number; used: number; value: number; message: string | null };
export type StaffPricePreview = { preview: PricingResult; coupons: StaffCouponPreview; coins: StaffCoinPreview | null };

// The account createOrder would bill, when the contact matches exactly one. Usage-capped and
// first-order coupons are judged against it; no match leaves those gates to createOrder. An
// account this staff member cannot see counts as no match, or a coupon's rejection reason
// would say that it exists.
async function previewCustomerId(contact: CreateOrderInput["contact"]): Promise<bigint | null> {
  const { known } = await knownCustomerAccounts(contact.email, contact.phone);
  return known.length === 1 ? known[0]! : null;
}

async function quotePrice(
  input: CreateOrderInput,
  couponCode?: string,
  requestedAmount?: number,
  coins?: number | "max",
): Promise<StaffPricePreview> {
  await requireStaff();
  const snap = await loadCatalogSnapshot();
  const trialMeal = snap.mealSizes.find((m) => m.publicId === input.selections.mealSizeId);
  const trial = trialMeal?.trial ? await quoteTrial(snap, input.selections) : null;
  // Same day rules as createOrder: weekend dish, frequency fit, allowed days.
  if (trialMeal) {
    const freq = snap.frequencies.find((f) => f.key === (trial ? trial.frequencyKey : input.selections.frequencyKey));
    const daysErr = planDaysError({
      eatingDays: (trial ? trial.eatingDays : input.selections.eatingDays ?? []) as DayOfWeek[],
      includeSaturday: !trial && input.selections.includeSaturday,
      includeSunday: !trial && input.selections.includeSunday,
      frequencyWeekdays: freq ? ((freq.weekdays ?? null) as DayOfWeek[] | null) : undefined,
      servesWeekends: trialMeal.servesWeekends,
      allowed: trialMeal.allowedDays,
      trial: trial != null,
    });
    if (daysErr) throw new ValidationError(daysErr);
  }
  const catalog = trial ? trial.catalog : buildPricingCatalog(snap, input.selections);
  // Same tax resolution as createOrder (delivery postal code + the method's own taxes), so the
  // total staff see and copy to the customer is the total charged.
  const method = input.paymentMethodId ? findMethod(await getPaymentConfig(), input.paymentMethodId) : undefined;
  const methodTaxes = method?.enabled ? method.taxes : [];
  const address = { line1: input.contact.addressLine, city: input.contact.city, postalCode: input.contact.postalCode };
  const selections = trial ? trial.pricingSelections : input.selections;
  const quote = async (adjustments: PricingLine[]) =>
    (await priceWithTax({ selections, catalog, adjustments, address, methodTaxes, reference: "admin-preview", cache: true })).pricing;
  const base = await quote([]);
  const plan = snap.plans.find((p) => p.key === input.planKey);
  const lines: PricingLine[] = [];

  // Customer coupons, resolved as createOrder does: against the subtotal after catalog discounts.
  const postCatalog = postCatalogSubtotal(base.subtotal, priceSubscription(selections, catalog).adjustments);
  const customerId = await previewCustomerId(input.contact);
  const best = await couponsService.resolveBestCoupons({
    subtotal: postCatalog,
    planType: plan?.planType,
    userId: customerId,
    paymentMethodId: method?.enabled ? method.id : "simulated",
    manualCode: input.couponCode,
    manualCodes: input.couponCodes,
  });
  let error: string | undefined;
  const applied: AppliedCoupon[] = [];
  for (const r of best.redemptions) {
    const amount = Math.min(r.amount, postCatalogSubtotal(postCatalog, lines));
    if (amount <= 0) continue;
    lines.push({ label: `${r.coupon.name} (${r.coupon.code})`, amount });
    applied.push({ code: r.coupon.code, name: r.coupon.name, amount, auto: r.coupon.autoApply });
  }

  // The rep discount goes on top of the coupons, judged against what is left, as in createOrder.
  const code = couponCode?.trim();
  const repAmount = requestedAmount ?? 0;
  const actorId = code && repAmount > 0 ? await actingStaffId() : null;
  const hasStaffCode = best.redemptions.some((r) => r.coupon.kind === "rep_code");
  if (code && actorId != null && hasStaffCode) {
    error = "Only one staff discount per order: remove the staff code or the rep discount";
  } else if (code && actorId != null) {
    try {
      const line = await couponsService.validateRepCoupon(code, {
        subtotal: postCatalogSubtotal(postCatalog, lines),
        requestedAmount: repAmount,
        actorId,
        planType: plan?.planType,
      });
      if (line.amount > 0) lines.push(line);
    } catch {
      // A rep coupon that no longer validates leaves the price undiscounted; createOrder is the gate.
    }
  }

  // Coins last, against what the coupons left, with the cap and clamp checkout and createOrder
  // use. Only a matched account has a wallet; unset `coins` (the order create forms) skips them.
  let coinPreview: StaffCoinPreview | null = null;
  if (coins != null && customerId != null) {
    const balance = await walletService.balance(customerId);
    const remaining = postCatalogSubtotal(postCatalog, lines);
    const [{ currency }, maxPct, maxRedeemPctOfBalance] = await Promise.all([getAppSettings(), getMaxCoinPctOfSubtotal(), getMaxCoinRedeemPctOfBalance()]);
    const rate = await walletService.activeRate(currency);
    const cap = quoteCoinCap({ subtotal: postCatalog, remaining, balance, rate, maxPct, maxRedeemPctOfBalance });
    const want = Math.max(0, Math.min(coins === "max" ? cap.maxCoins : Math.floor(coins), cap.maxCoins));
    const pctCap = maxPct == null ? Infinity : Math.round((postCatalog * (maxPct / 100) + Number.EPSILON) * 100) / 100;
    const redemption = want > 0 ? capRedemption(want, rate, Math.min(remaining, pctCap)) : { coinsSpent: 0, currencyValue: 0 };
    if (redemption.currencyValue > 0) lines.push({ label: `Coins (${redemption.coinsSpent})`, amount: redemption.currencyValue });
    coinPreview = {
      balance,
      maxCoins: cap.maxCoins,
      used: redemption.currencyValue > 0 ? redemption.coinsSpent : 0,
      value: redemption.currencyValue,
      message: coinCapMessage(cap, { balance, maxPct, maxRedeemPctOfBalance }),
    };
  }

  return {
    preview: lines.length > 0 ? await quote(lines) : base,
    coins: coinPreview,
    coupons: {
      applied,
      error,
      codeErrors: best.manualErrors,
      notApplied: best.notApplied,
      available: (await couponsService.listAvailable(customerId)).filter((c) => !c.autoApply),
    },
  };
}

export async function convertInquiry(
  inquiryId: string,
  input: CreateOrderInput,
): Promise<ActionResult<{ publicId: string; deploymentId: string; paymentPublicId: string; payUrl: string | null }>> {
  return runAction(async () => {
    await requireStaff();
    const result = await inquiriesService.convert(inquiryId, input);
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/inquiries");
    revalidatePath(`/dashboard/inquiries/${inquiryId}`);
    return { ...result, payUrl: await stripePayLink(result.paymentPublicId) };
  });
}
