import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { coinRate, eventPayout } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { PayoutGrid } from "./payout-grid";
import { CoinRateForm } from "./coin-rate-form";

export default async function WalletSettingsPage() {
  await requireAdmin();

  const payouts = await db
    .select({
      eventType: eventPayout.eventType,
      enabled: eventPayout.enabled,
      coins: eventPayout.coins,
    })
    .from(eventPayout)
    .orderBy(eventPayout.eventType);

  const [latestRate] = await db
    .select({
      currency: coinRate.currency,
      valuePerCoin: coinRate.valuePerCoin,
    })
    .from(coinRate)
    .orderBy(desc(coinRate.createdAt))
    .limit(1);

  return (
    <div className="grid gap-6">
      <PayoutGrid payouts={payouts} />
      <CoinRateForm current={latestRate ?? null} />
    </div>
  );
}
