"use server";

import { eq } from "drizzle-orm";
import { enabledMethods, findMethod } from "@realm/payments";
import { matchZone } from "@/lib/catalog/postal";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { priceSubscription, type PricingResult, type PricingSelections } from "@/lib/pricing";
import { couponsService } from "@/lib/services/coupons.service";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// An applied discount line, projected for the wizard's breakdown. `auto` is true
// for coupons that auto-applied (festival/launch promos), false for a manually
// entered code — so the UI can label which is which.
export interface AppliedCoupon {
  code: string;
  name: string;
  amount: number;
  auto: boolean;
}

export interface CheckoutPaymentMethod {
  id: string;
  label: string;
  instructions?: string;
  payeeHandle?: string;
  requireProof?: boolean;
}

// reprice always returns a valid PricingResult with the BEST valid combination of
// auto-apply coupons already folded into adjustments. When the customer also
// types a code it competes with the auto set (joins if stackable, replaces if
// better used alone). An invalid / expired / ineligible manual code yields
// `couponError` (inline in the wizard) while pricing keeps the auto-applied best.
// The amount is never trusted from the client — createOrder re-resolves it.
export interface RepriceResult {
  pricing: PricingResult;
  appliedCoupons: AppliedCoupon[];
  couponError?: string;
  paymentMethods: CheckoutPaymentMethod[];
}

export async function listCheckoutPaymentMethods(): Promise<CheckoutPaymentMethod[]> {
  const cfg = await getPaymentConfig();
  return enabledMethods(cfg).map((m) => ({
    id: m.id,
    label: m.label,
    instructions: m.instructions,
    payeeHandle: m.payeeHandle,
    requireProof: m.requireProof,
  }));
}

export async function reprice(
  selections: PricingSelections,
  couponCode?: string,
  planKey?: string,
  paymentMethodId?: string | null,
): Promise<RepriceResult> {
  const snapshot = await loadCatalogSnapshot();
  const catalog = buildPricingCatalog(snapshot, selections);
  const base = priceSubscription(selections, catalog);

  const paymentCfg = await getPaymentConfig();
  const paymentMethods = enabledMethods(paymentCfg).map((m) => ({
    id: m.id,
    label: m.label,
    instructions: m.instructions,
    payeeHandle: m.payeeHandle,
    requireProof: m.requireProof,
  }));
  const methodId = paymentMethodId?.trim() || "simulated";
  const method = methodId !== "simulated" ? findMethod(paymentCfg, methodId) : undefined;
  const taxes = method?.enabled ? method.taxes : [];

  // Resolve the plan's plan_type enum server-side from the catalog snapshot — the
  // client passes a plan KEY, not the plan_type. The optimizer checks
  // coupon.planTypes against the enum, so passing the key would wrongly reject
  // plan-restricted coupons. Mirrors createOrder / staff previewPrice.
  const planType = planKey ? snapshot.plans.find((p) => p.key === planKey)?.planType : undefined;

  // Resolve the logged-in member's internal id so the preview honors the SAME
  // userId-gated eligibility createOrder will (first_order prior-order check,
  // per-account maxPerUser exhaustion). Without this a returning customer would be
  // shown an auto-apply discount that the placed order silently drops, charging a
  // higher total than the preview promised. An anonymous/phone-only cart stays
  // userId=null — those gates are then decided server-side at order time.
  const session = await getSession();
  let userId: bigint | null = null;
  if (session?.user?.id) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1);
    userId = u?.id ?? null;
  }

  const best = await couponsService.resolveBestCoupons({
    subtotal: base.subtotal,
    planType,
    userId,
    paymentMethodId: methodId,
    manualCode: couponCode?.trim() || undefined,
  });

  const pricing = priceSubscription(selections, catalog, best.lines, taxes);
  const appliedCoupons: AppliedCoupon[] = best.redemptions.map((r) => ({
    code: r.coupon.code,
    name: r.coupon.name,
    amount: r.amount,
    auto: r.coupon.autoApply,
  }));
  return { pricing, appliedCoupons, couponError: best.manualError, paymentMethods };
}

export async function validatePostal(postalCode: string): Promise<{ served: boolean; zone?: { publicId: string; name: string; slotWindow: string } }> {
  const snapshot = await loadCatalogSnapshot();
  const zone = matchZone(postalCode, snapshot.zones);
  if (!zone) return { served: false };
  const full = snapshot.zones.find((z) => z.name === zone.name)!;
  return { served: true, zone: { publicId: full.publicId, name: full.name, slotWindow: full.slotWindow } };
}
