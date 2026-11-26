// Client-safe promo shapes and constants: no server imports, so "use client" files can use them.

export type PromoPlacement = "sticker" | "popup" | "section" | "bar";

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
  /** "Ends Mon, Dec 1" in the app timezone (last full day); null when the promotion has no end. */
  endsLabel?: string | null;
  /** Epoch ms the promotion ends; drives the live countdown. */
  endsAt?: number | null;
  /** A seasonal sale (Black Friday and friends): the bar, sticker and offer card take the sale look. */
  sale?: boolean;
  /** "$157": the most any plan saves with this promo (floored, so "up to" holds); null without a receipt. */
  upTo?: string | null;
  /** "29%": the best receipt's saving as a share of its subtotal, floored. */
  upToPct?: string | null;
  /** "$200": the linked coupon's minimum order, when it has one. */
  minSpend?: string | null;
}

/** One discount on a receipt. `figure` + `perk` are the price-list form: "15%" + "off 12-week plans". */
/** `figure` is the headline form: a percent for plan discounts, money for a fixed code; `short` names what it is for. */
export interface PromoLine { label: string; amount: number; figure?: string; perk?: string; short?: string }

/** One real plan priced through checkout: the subtotal, each discount, and what it all saves. */
export interface PromoReceipt {
  example: string;
  subtotalLabel: string;
  subtotal: number;
  lines: PromoLine[];
  total: number;
  /** "Eats 5 days, delivered MWF" when eating days exceed delivery days. */
  note?: string;
}

/** An honest example receipt: what one real plan saves at checkout today. */
export interface PromoSavings extends PromoReceipt {
  /** "Save over $70": always below the example's real total. */
  headline: string;
  /** "on 8+ week plans" */
  condition: string;
  /** The most any plan saves (dearest size, longest plan); null when it adds nothing. */
  upTo: number | null;
  /** The receipt behind `upTo`: dearest meal, longest plan, best schedule, plus the code. */
  best: PromoReceipt | null;
  /** The best receipt's discounts, plan length first (price-list and ticker rows). */
  perks: PromoLine[];
}

export interface LandingPromos {
  /** Hero sticker: a "Hero sticker" promotion, else the strongest public coupon. */
  sticker: LandingPromo | null;
  /** Only a promotion staff placed as "Popup"; no coupon fallback. */
  popup: LandingPromo | null;
  /** Offer carousel slides: every live "Landing section" promotion, priority order. */
  sections: LandingPromo[];
  /** Thin strip above the site header on every public page: highest-priority "Promo bar" promotion. */
  bar: LandingPromo | null;
}

export const PROMO_POPUP_SEEN_KEY = "tg.promo.popup.seen";
