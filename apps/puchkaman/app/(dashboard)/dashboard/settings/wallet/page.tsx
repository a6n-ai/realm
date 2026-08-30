import { CoinsIcon } from "lucide-react";
import { desc } from "drizzle-orm";
import { PageHeader, PageShell } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate, eventPayout } from "@/db/schema";
import { AWARDABLE_EVENTS } from "@/lib/services/wallet.service";
import { PayoutGrid, type PayoutRow } from "./payout-grid";
import { CoinRateForm } from "./coin-rate-form";

export default async function WalletSettingsPage() {
  await requireAdmin();

  const [savedPayouts, [latestRate]] = await Promise.all([
    db
      .select({ eventType: eventPayout.eventType, enabled: eventPayout.enabled, coins: eventPayout.coins })
      .from(eventPayout),
    db
      .select({ currency: coinRate.currency, valuePerCoin: coinRate.valuePerCoin })
      .from(coinRate)
      .orderBy(desc(coinRate.createdAt))
      .limit(1),
  ]);

  // AWARDABLE_EVENTS, not app_event: only those have an award call site, and a
  // switch for an event nothing awards is a lie. Nothing seeds event_payout, so
  // an awardable event never saved here still renders: disabled, 0 coins.
  const savedByEvent = new Map(savedPayouts.map((p) => [p.eventType, p]));
  const payouts: PayoutRow[] = AWARDABLE_EVENTS.map((eventType) => {
    const saved = savedByEvent.get(eventType);
    return { eventType, enabled: saved?.enabled ?? false, coins: saved?.coins ?? 0 };
  });

  return (
    <PageShell>
      <PageHeader icon={CoinsIcon} title="Wallet" subtitle="Coin earning rules and the coin-to-CAD exchange rate." />
      <div className="grid gap-6">
        <PayoutGrid payouts={payouts} hasCoinRate={Boolean(latestRate)} />
        <CoinRateForm current={latestRate ?? null} />
      </div>
    </PageShell>
  );
}
