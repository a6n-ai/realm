import type { ReferralSettings } from "@/lib/services/app-settings.service";

export type CoinRate = { perCoin: number; currency: string } | null;

/** The friend's side of the offer, as the share image and message say it. Null while rewards are off. */
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

export const referCardPath = (code: string) => `/api/refer-card/${code}`;
