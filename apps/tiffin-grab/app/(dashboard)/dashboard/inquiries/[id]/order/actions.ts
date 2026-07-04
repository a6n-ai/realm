"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { zonedDateIso } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { coupons, users } from "@/db/schema";
import { inquiriesService } from "@/lib/services/inquiries.service";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import { couponsService } from "@/lib/services/coupons.service";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { priceSubscription, type PricingLine, type PricingResult } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";

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
export async function previewPrice(
  input: CreateOrderInput,
  couponCode?: string,
  requestedAmount?: number,
): Promise<PricingResult> {
  await requireStaff();
  const snap = await loadCatalogSnapshot();
  const catalog = buildPricingCatalog(snap, input.selections);
  const base = priceSubscription(input.selections, catalog);

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

export async function convertInquiry(inquiryId: string, input: CreateOrderInput): Promise<void> {
  await requireStaff();
  const { deploymentId } = await inquiriesService.convert(inquiryId, input);
  redirect(`/activate/${deploymentId}`);
}
