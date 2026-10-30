import type { ReferralSettings } from "@/lib/services/app-settings.service";

export type CoinRate = { perCoin: number; currency: string } | null;

/** The friend's reward split for a promo layout: the headline figure and what it is. Null while rewards are off. */
export function friendOfferParts(settings: ReferralSettings, rate: CoinRate): { big: string; small: string } | null {
  const v = settings.friendValue;
  if (v <= 0) return null;
  if (settings.mode === "pct") return { big: `${v}%`, small: "back in coins" };
  const coins = `${v} ${v === 1 ? "coin" : "coins"}`;
  if (!rate) return { big: coins, small: "in your wallet" };
  const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: rate.currency }).format(v * rate.perCoin);
  return { big: money, small: `${coins} in your wallet` };
}

/** The friend's side of the offer, as the share message says it. Null while rewards are off. */
export function friendOffer(settings: ReferralSettings, rate: CoinRate): string | null {
  const v = settings.friendValue;
  if (v <= 0) return null;
  if (settings.mode === "pct") return `${v}% back on your first plan`;
  const money = rate ? new Intl.NumberFormat("en-CA", { style: "currency", currency: rate.currency }).format(v * rate.perCoin) : null;
  return `${v} ${v === 1 ? "coin" : "coins"}${money ? ` (${money})` : ""} on your first plan`;
}

export function shareMessage(code: string, link: string, offer: string | null): string {
  const hook = offer ? `Get ${offer} with my code ${code}.` : `Use my code ${code} when you sign up.`;
  return `Home-style tiffins from TiffinGrab, delivered across the GTA. ${hook}\n${link}`;
}

/** What friends get sent: /r/CODE redirects to /subscribe?ref=CODE. */
export const referPath = (code: string) => `/r/${code}`;

/** Portrait phone image by default; `og` is the landscape link-preview card. */
export const referCardPath = (code: string, size?: "og") => `/api/refer-card/${code}${size ? `?size=${size}` : ""}`;
