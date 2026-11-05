// Client-safe promo shapes and constants: no server imports, so "use client" files can use them.

export type PromoPlacement = "sticker" | "popup" | "section";

export interface LandingPromo {
  id: string;
  title: string;
  blurb: string | null;
  /** Sanitized HTML body from the promotions editor; null for coupon-only offers. */
  html: string | null;
  imageUrl: string | null;
  /** Short headline for the hero sticker ("15% off"); falls back to the title. */
  badge?: string | null;
  code: string | null;
  href: string;
  cta: string;
  /** Worked out from live discounts + the linked coupon (lib/landing/savings.ts); null when there is no coupon. */
  savings?: PromoSavings | null;
}

/** An honest example receipt: what one real plan saves at checkout today. */
export interface PromoSavings {
  /** "Save over $70": always below the example's real total. */
  headline: string;
  /** "on 8+ week plans" */
  condition: string;
  /** "8 weeks, 3 Days/Wk Alternate (MWF)" */
  example: string;
  subtotalLabel: string;
  subtotal: number;
  lines: { label: string; amount: number }[];
  total: number;
  /** The most any plan saves (dearest size, longest plan); null when it adds nothing. */
  upTo: number | null;
}

export interface LandingPromos {
  /** Hero sticker: a "Hero sticker" promotion, else the strongest public coupon. */
  sticker: LandingPromo | null;
  /** Only a promotion staff placed as "Popup"; no coupon fallback. */
  popup: LandingPromo | null;
  /** Offer carousel slides: every live "Landing section" promotion, priority order. */
  sections: LandingPromo[];
}

export const PROMO_POPUP_SEEN_KEY = "tg.promo.popup.seen";
