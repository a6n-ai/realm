import { Suspense } from "react";
import { latestCoinRateValue } from "@/lib/services/wallet-balances.service";
import {
  getAppSettings,
  getCoinEarnPct,
  getMaxCoinPctOfSubtotal,
  getMaxCoinRedeemPctOfBalance,
  getMaxWalletBalance,
} from "@/lib/services/app-settings.service";
import { CoinRateForm, WalletCapForm } from "@foundry/crm";
import { saveCoinRate } from "../actions";
import { setWalletCapAction } from "./actions";
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
      <CoinRateForm
        currency={currency}
        current={latestRate != null ? { valuePerCoin: latestRate } : null}
        onSave={saveCoinRate}
      />
      <EarnPctForm current={earnPct} />
      <WalletCapForm current={maxWalletBalance} onSave={setWalletCapAction} />
      <CoinCapForm current={maxCoinPct} />
      <WalletRedeemCapForm current={maxRedeemPct} />
    </div>
  );
}
