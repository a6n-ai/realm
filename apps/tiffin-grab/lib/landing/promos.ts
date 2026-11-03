import { couponsService, type AvailableCoupon } from "@/lib/services/coupons.service";
import { hasPlacement } from "@/lib/promotions/live";
import { promotionsService, type Promotion } from "@/lib/services/promotions.service";

import type { LandingPromo, LandingPromos } from "@/lib/landing/promo-types";

export type { LandingPromo, LandingPromos, PromoPlacement } from "@/lib/landing/promo-types";

// `c` is the estimate-link coupon key (components/wizard/selections.ts QUOTE_PARAMS): it rides
// through sign-in to checkout, which re-validates it server side.
export const subscribeHref = (code: string | null) => (code ? `/subscribe?c=${encodeURIComponent(code)}` : "/subscribe");

export function couponHeadline(c: Pick<AvailableCoupon, "valuePct" | "valueAmount" | "name">): string {
  const pct = c.valuePct != null ? Number(c.valuePct) : 0;
  const amt = c.valueAmount != null ? Number(c.valueAmount) : 0;
  if (pct > 0) return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}% off`;
  if (amt > 0) return `$${Number.isInteger(amt) ? amt : amt.toFixed(2)} off`;
  return c.name;
}

function fromCoupon(c: AvailableCoupon): LandingPromo {
  return {
    id: `coupon:${c.code}`,
    title: `${couponHeadline(c)} with ${c.code}`,
    blurb: c.description ?? c.name,
    html: null,
    imageUrl: null,
    code: c.code,
    badge: couponHeadline(c),
    href: subscribeHref(c.code),
    cta: "Claim offer",
  };
}

// Biggest saving first, so the sticker and popup lead with the strongest offer.
const strength = (c: AvailableCoupon) => (Number(c.valuePct ?? 0) * 1000) + Number(c.valueAmount ?? 0);

// Staff paste our own photos as absolute URLs (https://tiffingrab.ca/landing/...). Keep only the
// path so the tile can go through next/image (WebP at its width) instead of the full JPEG.
export function ownImagePath(url: string | null): string | null {
  if (!url) return url;
  try {
    const u = new URL(url);
    const own = u.hostname === "tiffingrab.ca" || u.hostname.endsWith(".tiffingrab.ca");
    return own && !u.search && u.pathname.startsWith("/landing/") ? u.pathname : url;
  } catch {
    return url;
  }
}

function fromPromotion(p: Promotion, coupons: Map<string, AvailableCoupon>): LandingPromo {
  const coupon = p.couponCode ? coupons.get(p.couponCode.toUpperCase()) : undefined;
  return {
    id: p.publicId,
    title: p.title,
    blurb: p.blurb,
    html: p.html,
    imageUrl: ownImagePath(p.imageUrl),
    badge: coupon ? couponHeadline(coupon) : null,
    code: p.couponCode,
    href: p.ctaHref || subscribeHref(p.couponCode),
    cta: p.ctaLabel,
  };
}

export async function loadLandingPromos(): Promise<LandingPromos> {
  const [coupons, live] = await Promise.all([
    couponsService.listAvailable().catch(() => [] as AvailableCoupon[]),
    promotionsService.listLive().catch(() => [] as Promotion[]),
  ]);
  const byCode = new Map(coupons.map((c) => [c.code.toUpperCase(), c]));
  const placed = (placement: string) => live.filter((x) => hasPlacement(x, placement)).map((p) => fromPromotion(p, byCode));
  const strongest = [...coupons].sort((a, b) => strength(b) - strength(a))[0];
  return {
    sticker: placed("sticker")[0] ?? (strongest ? fromCoupon(strongest) : null),
    popup: placed("popup")[0] ?? null,
    sections: placed("section"),
  };
}
