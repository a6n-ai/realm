import { friendOfferParts, referralPillLabel, referrerOfferParts, siteFigure, type CoinRate } from "@/lib/referrals/share";
import { getAppSettings, getReferralSettings } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/services/wallet.service";

export type OfferFigure = { big: string; small: string };

export type ReferralOffer = {
  /** Either side pays something; false hides every referral surface. */
  on: boolean;
  friend: OfferFigure | null;
  referrer: OfferFigure | null;
  maxPerReferrer: number | null;
  pillLabel: string | null;
};

const forSite = (f: OfferFigure | null): OfferFigure | null => (f ? { ...f, big: siteFigure(f.big) } : null);

/** Live referral figures for the public site, from the same settings and rate the share card uses. */
export async function loadReferralOffer(): Promise<ReferralOffer> {
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
  };
}
