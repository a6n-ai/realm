import { Suspense } from "react";
import { latestCoinRateValue } from "@/lib/wallet/wallet-balances.service";
import { getAppSettings } from "@/lib/settings";
import { getCoinEarnPct, getMaxCoinPctOfSubtotal, getMaxCoinRedeemPctOfBalance, getMaxWalletBalance } from "@/lib/wallet/wallet-settings";
import { CoinRateSettings, WalletCapSettings } from "./foundry-forms";
import { CoinRateFormSkeleton } from "./coin-rate-form-skeleton";
import { EarnPctForm } from "./earn-pct-form";
import { CoinCapForm } from "./coin-cap-form";
import { WalletRedeemCapForm } from "./wallet-redeem-cap-form";

export default function WalletSettingsPage() {
  return (
    <Suspense fallback={<CoinRateFormSkeleton />}>
      <WalletSettingsData />
    </Suspense>
  );
}

async function WalletSettingsData() {
  const [latestRate, { currency }, maxWalletBalance, earnPct, maxCoinPct, maxRedeemPct] = await Promise.all([
    latestCoinRateValue(),
    getAppSettings(),
    getMaxWalletBalance(),
    getCoinEarnPct(),
    getMaxCoinPctOfSubtotal(),
    getMaxCoinRedeemPctOfBalance(),
  ]);

  return (
    <div className="grid gap-6">
      <CoinRateSettings currency={currency} current={latestRate != null ? { valuePerCoin: latestRate } : null} />
      <EarnPctForm current={earnPct} />
      <WalletCapSettings current={maxWalletBalance} />
      <CoinCapForm current={maxCoinPct} />
      <WalletRedeemCapForm current={maxRedeemPct} />
    </div>
  );
}
