import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate } from "@/db/schema";
import {
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
  await requireAdmin();

  const [[latestRate], maxWalletBalance, earnPct, maxCoinPct, maxRedeemPct] = await Promise.all([
    db.select({ valuePerCoin: coinRate.valuePerCoin }).from(coinRate).orderBy(desc(coinRate.createdAt)).limit(1),
    getMaxWalletBalance(),
    getCoinEarnPct(),
    getMaxCoinPctOfSubtotal(),
    getMaxCoinRedeemPctOfBalance(),
  ]);

  return (
    <div className="grid gap-6">
      <CoinRateForm
        currency="CAD"
        current={latestRate ? { valuePerCoin: latestRate.valuePerCoin } : null}
        onSave={saveCoinRate}
      />
      <EarnPctForm current={earnPct} />
      <WalletCapForm current={maxWalletBalance} onSave={setWalletCapAction} />
      <CoinCapForm current={maxCoinPct} />
      <WalletRedeemCapForm current={maxRedeemPct} />
    </div>
  );
}
