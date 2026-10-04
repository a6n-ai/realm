"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { ValidationError, zonedDateIso } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { weekendDaysError } from "@/lib/menu/delivery-days";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { coupons, orders, users } from "@/db/schema";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { resolveSessionVisibleOrgIds, type CreateOrderInput } from "@/lib/services/orders.service";
import { couponsService } from "@/lib/services/coupons.service";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { earliestNewPlanStart } from "@/lib/services/order-window";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { priceSubscription, type PricingLine, type PricingResult } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { quoteTrial } from "@/lib/trial/quote";
import { round2 } from "@/lib/custom-meal/pricing";
import { mealPlanKey } from "@/lib/custom-meal/composition";
import { customMealSchema, priceCustomComposition, TRANSIENT_CUSTOM_SIZE_ID, withTransientCustomSize } from "@/lib/services/custom-meal.service";

const IST = "Asia/Kolkata";

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

  const istDate = zonedDateIso(Date.now(), IST);
  const [c] = await db
    .select({
      code: coupons.code,
      name: coupons.name,
      capPct: coupons.capPct,
      capAmount: coupons.capAmount,
      redemptionCount: coupons.redemptionCount,
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
  if (c.redemptionCount !== 0) return { available: false, reason: "used" };
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
// amount, validate it server-side (owner == actor, IST-day valid, unused) and
// clamp to the dual ceiling before folding it into adjustments. A coupon that no
// longer validates falls back to the un-discounted preview — the authoritative
// gate is createOrder.
export async function trialFormSettings() {
  await requireStaff();
  return getTrialSettings(await resolveRequestOrg());
}

// First day a new plan for this customer may start (the day after their running plans
// end), or null for a new customer / no running plan. Same rule createOrder enforces.
export async function customerRenewalStart(email: string): Promise<string | null> {
  await requireStaff();
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const [user] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.email, normalized), eq(users.role, "user"))).limit(1);
  if (!user) return null;
  // Only reveal plan dates to staff who can already see one of this customer's orders.
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  if (visible !== "all") {
    if (visible.length === 0) return null;
    const [seen] = await db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.userId, user.id), inArray(orders.organizationId, visible))).limit(1);
    if (!seen) return null;
  }
  return earliestNewPlanStart(db, user.id);
}

// Returned, not thrown: production strips a thrown action's message, and staff
// need the real reason the order can't be priced.
export async function previewPrice(
  input: CreateOrderInput,
  couponCode?: string,
  requestedAmount?: number,
  customMeal?: unknown,
): Promise<ActionResult<{ preview: PricingResult }>> {
  return runAction(async () => ({ preview: await quotePrice(input, couponCode, requestedAmount, customMeal) }));
}

async function quotePrice(
  input: CreateOrderInput,
  couponCode?: string,
  requestedAmount?: number,
  customMeal?: unknown,
): Promise<PricingResult> {
  await requireStaff();
  let snap = await loadCatalogSnapshot();
  let override: number | null = null;
  // Custom meal (New Order): price the composition as an unsaved size, mirroring
  // createOrderFlow's plan/size substitution and createOrder's override.
  if (customMeal != null) {
    const parsed = customMealSchema.safeParse(customMeal);
    if (!parsed.success) throw new ValidationError(`Custom meal: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    const priced = await priceCustomComposition(parsed.data.items, parsed.data.basePriceOverride);
    const planKey = parsed.data.planKey ?? mealPlanKey(priced.items);
    snap = withTransientCustomSize(snap, priced, planKey);
    input = { ...input, planKey, selections: { ...input.selections, mealSizeId: TRANSIENT_CUSTOM_SIZE_ID } };
    override = parsed.data.basePriceOverride ?? null;
  }
  const trialMeal = snap.mealSizes.find((m) => m.publicId === input.selections.mealSizeId);
  const weekendErr = trialMeal && !trialMeal.trial ? weekendDaysError(input.selections.eatingDays ?? [], trialMeal.servesWeekends) : null;
  if (weekendErr) throw new ValidationError(weekendErr);
  const trial = trialMeal?.trial ? await quoteTrial(snap, input.selections) : null;
  const catalog = trial ? trial.catalog : buildPricingCatalog(snap, input.selections);
  if (override != null) catalog.mealSize = { ...catalog.mealSize, basePrice: round2(override) };
  const base = priceSubscription(trial ? trial.pricingSelections : input.selections, catalog);

  const code = couponCode?.trim();
  if (!code || requestedAmount == null || requestedAmount <= 0) return base;

  const actorId = await actingStaffId();
  if (actorId == null) return base;
  const plan = snap.plans.find((p) => p.key === input.planKey);

  try {
    const line: PricingLine = await couponsService.validateRepCoupon(code, {
      subtotal: base.subtotal,
      requestedAmount,
      actorId,
      planType: plan?.planType,
    });
    return priceSubscription(input.selections, catalog, [line]);
  } catch {
    return base;
  }
}

export async function convertInquiry(
  inquiryId: string,
  input: CreateOrderInput,
): Promise<ActionResult<{ publicId: string; deploymentId: string }>> {
  return runAction(async () => {
    await requireStaff();
    const result = await inquiriesService.convert(inquiryId, input);
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/inquiries");
    revalidatePath(`/dashboard/inquiries/${inquiryId}`);
    return result;
  });
}
