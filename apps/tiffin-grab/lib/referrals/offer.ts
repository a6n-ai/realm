import { friendOfferParts, referralPillLabel, referrerOfferParts, siteFigure, type CoinRate } from "@/lib/referrals/share";
import { getAppSettings, getReferralSettings } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/wallet/wallet.service";

export type OfferFigure = { big: string; small: string };

export type ReferralOffer = {
  /** Either side pays something; false hides every referral surface. */
  on: boolean;
  friend: OfferFigure | null;
  referrer: OfferFigure | null;
  maxPerReferrer: number | null;
  pillLabel: string | null;
  /** Coins the friend gets on a flat reward (the demo counts them up); null in pct mode or when off. */
  friendCoins: number | null;
  /** Same for the referrer's own reward. */
  referrerCoins: number | null;
};

const forSite = (f: OfferFigure | null): OfferFigure | null => (f ? { ...f, big: siteFigure(f.big) } : null);

/** Live referral figures for the public site, from the same settings and rate the share card uses. */
const OFFER_OFF: ReferralOffer = { on: false, friend: null, referrer: null, maxPerReferrer: null, pillLabel: null, friendCoins: null, referrerCoins: null };

/** Optional content: any failure reads as "no referral offer" (every caller hides the surface when `on` is false). */
export async function loadReferralOffer(): Promise<ReferralOffer> {
  try {
    return await buildReferralOffer();
  } catch {
    return OFFER_OFF;
  }
}

/** Throws on failure: for callers that must not cache a fallback (the public API keeps answers for an hour). */
export async function buildReferralOffer(): Promise<ReferralOffer> {
  const [settings, { currency }] = await Promise.all([getReferralSettings(), getAppSettings()]);
  const perCoin = await walletService.activeRate(currency).catch(() => null);
  const rate: CoinRate = perCoin == null ? null : { perCoin, currency };
  const friend = friendOfferParts(settings, rate);
  const referrer = referrerOfferParts(settings, rate);
  return {
    on: friend != null || referrer != null,
    friend: forSite(friend),
    referrer: forSite(referrer),
    maxPerReferrer: settings.maxPerReferrer,
    pillLabel: referralPillLabel(friend),
    friendCoins: settings.mode === "flat" && settings.friendValue > 0 ? settings.friendValue : null,
    referrerCoins: settings.mode === "flat" && settings.referrerValue > 0 ? settings.referrerValue : null,
  };
}
