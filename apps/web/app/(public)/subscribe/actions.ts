"use server";

import { matchZone } from "@/lib/catalog/postal";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { priceSubscription, type PricingResult, type PricingSelections } from "@/lib/pricing";
import { couponsService } from "@/lib/services/coupons.service";

// reprice always returns a valid base PricingResult; when a coupon code is
// supplied it is validated server-side and folded into adjustments. An invalid /
// expired / min-spend / not-first-order code yields `couponError` (inline in the
// wizard) while pricing falls back to the un-discounted total. The amount is
// never trusted from the client — createOrder re-resolves it at order time.
export interface RepriceResult {
  pricing: PricingResult;
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

  const code = couponCode?.trim();
  if (!code) return { pricing: base };

  // Resolve the plan's plan_type enum server-side from the catalog snapshot — the
  // client passes a plan KEY, not the plan_type. validatePublicCode checks
  // coupon.planTypes against the enum, so passing the key would wrongly reject
  // plan-restricted public coupons. Mirrors createOrder / staff previewPrice.
  const planType = planKey ? snapshot.plans.find((p) => p.key === planKey)?.planType : undefined;
  try {
    const line = await couponsService.validatePublicCode(code, { subtotal: base.subtotal, planType });
    return { pricing: priceSubscription(selections, catalog, [line]) };
  } catch (e) {
    return { pricing: base, couponError: e instanceof Error ? e.message : "Invalid coupon code" };
  }
}

export async function validatePostal(postalCode: string): Promise<{ served: boolean; zone?: { publicId: string; name: string; slotWindow: string } }> {
  const snapshot = await loadCatalogSnapshot();
  const zone = matchZone(postalCode, snapshot.zones);
  if (!zone) return { served: false };
  const full = snapshot.zones.find((z) => z.name === zone.name)!;
  return { served: true, zone: { publicId: full.publicId, name: full.name, slotWindow: full.slotWindow } };
}
