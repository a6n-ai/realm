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
