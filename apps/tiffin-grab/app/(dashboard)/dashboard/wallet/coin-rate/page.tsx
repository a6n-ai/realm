import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate } from "@/db/schema";
import { getMaxWalletBalance } from "@/lib/services/app-settings.service";
import { CoinRateForm } from "../coin-rate-form";
import { WalletCapForm } from "../wallet-cap-form";
import { CoinRateFormSkeleton } from "./coin-rate-form-skeleton";

export default function CoinRatePage() {
  return (
    <Suspense fallback={<CoinRateFormSkeleton />}>
      <CoinRateData />
    </Suspense>
  );
}

async function CoinRateData() {
  await requireAdmin();

  const [[latestRate], maxWalletBalance] = await Promise.all([
    db
      .select({
        currency: coinRate.currency,
        valuePerCoin: coinRate.valuePerCoin,
      })
      .from(coinRate)
      .orderBy(desc(coinRate.createdAt))
      .limit(1),
    getMaxWalletBalance(),
  ]);

  return (
    <div className="grid gap-6">
      <CoinRateForm current={latestRate ?? null} />
      <WalletCapForm current={maxWalletBalance} />
    </div>
  );
}
