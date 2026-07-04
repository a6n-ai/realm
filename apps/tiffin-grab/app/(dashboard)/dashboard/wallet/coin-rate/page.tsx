import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate } from "@/db/schema";
import { CoinRateForm } from "../coin-rate-form";
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

  const [latestRate] = await db
    .select({
      currency: coinRate.currency,
      valuePerCoin: coinRate.valuePerCoin,
    })
    .from(coinRate)
    .orderBy(desc(coinRate.createdAt))
    .limit(1);

  return <CoinRateForm current={latestRate ?? null} />;
}
