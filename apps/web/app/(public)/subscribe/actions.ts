"use server";

import { matchZone } from "@/lib/catalog/postal";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { priceSubscription, type PricingResult, type PricingSelections } from "@/lib/pricing";
import { couponsService } from "@/lib/services/coupons.service";

// An applied discount line, projected for the wizard's breakdown. `auto` is true
// for coupons that auto-applied (festival/launch promos), false for a manually
// entered code — so the UI can label which is which.
export interface AppliedCoupon {
  code: string;
  name: string;
  amount: number;
  auto: boolean;
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
}

export async function reprice(
  selections: PricingSelections,
  couponCode?: string,
  planKey?: string,
): Promise<RepriceResult> {
  const snapshot = await loadCatalogSnapshot();
  const catalog = buildPricingCatalog(snapshot, selections);
  const base = priceSubscription(selections, catalog);

  // Resolve the plan's plan_type enum server-side from the catalog snapshot — the
  // client passes a plan KEY, not the plan_type. The optimizer checks
  // coupon.planTypes against the enum, so passing the key would wrongly reject
  // plan-restricted coupons. Mirrors createOrder / staff previewPrice.
  const planType = planKey ? snapshot.plans.find((p) => p.key === planKey)?.planType : undefined;
  const best = await couponsService.resolveBestCoupons({
    subtotal: base.subtotal,
    planType,
    manualCode: couponCode?.trim() || undefined,
  });

  const pricing = best.lines.length ? priceSubscription(selections, catalog, best.lines) : base;
  const appliedCoupons: AppliedCoupon[] = best.redemptions.map((r) => ({
    code: r.coupon.code,
    name: r.coupon.name,
    amount: r.amount,
    auto: r.coupon.autoApply,
  }));
  return { pricing, appliedCoupons, couponError: best.manualError };
}

export async function validatePostal(postalCode: string): Promise<{ served: boolean; zone?: { publicId: string; name: string; slotWindow: string } }> {
  const snapshot = await loadCatalogSnapshot();
  const zone = matchZone(postalCode, snapshot.zones);
  if (!zone) return { served: false };
  const full = snapshot.zones.find((z) => z.name === zone.name)!;
  return { served: true, zone: { publicId: full.publicId, name: full.name, slotWindow: full.slotWindow } };
}
