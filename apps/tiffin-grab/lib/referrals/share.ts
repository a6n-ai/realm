import type { ReferralSettings } from "@/lib/services/app-settings.service";
import { formatMoney } from "@foundry/commons";

export type CoinRate = { perCoin: number; currency: string } | null;

/** The friend's reward split for a promo layout: the headline figure and what it is. Null while rewards are off. */
export function friendOfferParts(settings: ReferralSettings, rate: CoinRate): { big: string; small: string } | null {
  return offerParts(settings.friendValue, settings, rate);
}

/** The sharer's side, in the same format as the friend's. Null while that side is off. */
export function referrerOfferParts(settings: ReferralSettings, rate: CoinRate): { big: string; small: string } | null {
  return offerParts(settings.referrerValue, settings, rate);
}

/** Public pages read "$15", not "$15.00"; the share card and /me keep the full format. */
export function siteFigure(big: string): string {
  return big.replace(/^(\$\d+)\.00$/, "$1");
}

/** The floating bar holds a short dollar figure ("Give $15"); anything longer reads "Refer". The gift icon is drawn beside it. */
export function referralPillLabel(friend: { big: string } | null): string | null {
  if (!friend) return null;
  const figure = siteFigure(friend.big);
  return figure.startsWith("$") && figure.length <= 4 ? `Give ${figure}` : "Refer";
}

function offerParts(v: number, settings: ReferralSettings, rate: CoinRate): { big: string; small: string } | null {
  if (v <= 0) return null;
  if (settings.mode === "pct") return { big: `${v}%`, small: "back in coins" };
  const coins = `${v} ${v === 1 ? "coin" : "coins"}`;
  if (!rate) return { big: coins, small: "in your wallet" };
  const money = formatMoney(v * rate.perCoin, rate.currency);
  return { big: money, small: `${coins} in your wallet` };
}

/** The friend's side of the offer, as the share message says it. Null while rewards are off. */
export function friendOffer(settings: ReferralSettings, rate: CoinRate): string | null {
  const v = settings.friendValue;
  if (v <= 0) return null;
  if (settings.mode === "pct") return `${v}% back on your first plan`;
  const money = rate ? formatMoney(v * rate.perCoin, rate.currency) : null;
  return `${v} ${v === 1 ? "coin" : "coins"}${money ? ` (${money})` : ""} on your first plan`;
}

export function shareMessage(code: string, link: string, offer: string | null): string {
  const hook = offer ? `Get ${offer} with my code ${code}.` : `Use my code ${code} when you sign up.`;
  return `Home-style tiffins from TiffinGrab, delivered across the GTA. ${hook}\n${link}`;
}

/** What friends get sent: /r/CODE redirects to /subscribe?ref=CODE. */
export const referPath = (code: string) => `/r/${code}`;

/** Portrait phone image by default; `og` is the landscape link-preview card. `dark` matches the app's dark mode. */
export function referCardPath(code: string, opts: { size?: "og"; theme?: "light" | "dark" } = {}): string {
  const q = new URLSearchParams();
  if (opts.size) q.set("size", opts.size);
  if (opts.theme === "dark") q.set("theme", "dark");
  const qs = q.toString();
  return `/api/refer-card/${code}${qs ? `?${qs}` : ""}`;
}
