import { ValidationError } from "@foundry/commons";
import { capRedemption } from "@foundry/wallet";
import { planDaysError, type DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { postCatalogSubtotal } from "@/lib/pricing/discounts";
import { coinLimits, quoteCoinCap } from "@/lib/pricing/coin-cap";
import { priceSubscription, type PricingSelections } from "@/lib/pricing";
import { quoteTrial } from "@/lib/trial/quote";
import { getAppSettings, getMaxCoinPctOfSubtotal, getMaxCoinRedeemPctOfBalance } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/wallet/wallet.service";

/**
 * Cart pricing shared by the wizard preview and the staff preview: trial quote, the
 * same day rules createOrder applies, the pricing catalog, the base price and the
 * post-catalog subtotal. createOrder interleaves other checks between these steps,
 * so it keeps its own copy.
 */
export async function priceCart(snapshot: CatalogSnapshot, selections: PricingSelections) {
  const mealSize = snapshot.mealSizes.find((m) => m.publicId === selections.mealSizeId);
  const trial = mealSize?.trial ? await quoteTrial(snapshot, selections) : null;
  if (mealSize) {
    const freqKey = trial ? trial.frequencyKey : selections.frequencyKey;
    const freq = snapshot.frequencies.find((f) => f.key === freqKey);
    const daysErr = planDaysError({
      eatingDays: (trial ? trial.eatingDays : selections.eatingDays ?? []) as DayOfWeek[],
      includeSaturday: !trial && selections.includeSaturday,
      includeSunday: !trial && selections.includeSunday,
      frequencyWeekdays: freq ? ((freq.weekdays ?? null) as DayOfWeek[] | null) : undefined,
      servesWeekends: mealSize.servesWeekends,
      allowed: mealSize.allowedDays,
      trial: trial != null,
    });
    if (daysErr) throw new ValidationError(daysErr);
  }
  const catalog = trial ? trial.catalog : buildPricingCatalog(snapshot, selections);
  const pricedSelections = trial ? trial.pricingSelections : selections;
  const base = priceSubscription(pricedSelections, catalog);
  const postCatalog = postCatalogSubtotal(base.subtotal, base.adjustments);
  return { mealSize, trial, catalog, pricedSelections, base, postCatalog };
}

export type CoinConfig = { rate: number; maxPct: number | null; maxRedeemPctOfBalance: number | null };

export async function loadCoinConfig(currency?: string): Promise<CoinConfig> {
  const cur = currency ?? (await getAppSettings()).currency;
  const [rate, maxPct, maxRedeemPctOfBalance] = await Promise.all([walletService.activeRate(cur), getMaxCoinPctOfSubtotal(), getMaxCoinRedeemPctOfBalance()]);
  return { rate, maxPct, maxRedeemPctOfBalance };
}

/** The cap and clamp every coin path shares; callers keep their own refuse/clamp policy. */
export function coinQuote(cfg: CoinConfig, args: { balance: number; postCatalog: number; remaining: number }) {
  const { balance, postCatalog, remaining } = args;
  const { rate, maxPct, maxRedeemPctOfBalance } = cfg;
  const cap = quoteCoinCap({ subtotal: postCatalog, remaining, balance, rate, maxPct, maxRedeemPctOfBalance });
  const { pctCap, walletPctCap } = coinLimits({ subtotal: postCatalog, balance, maxPct, maxRedeemPctOfBalance });
  return { ...cfg, cap, pctCap, walletPctCap, redeem: (want: number) => capRedemption(want, rate, Math.min(remaining, pctCap)) };
}
