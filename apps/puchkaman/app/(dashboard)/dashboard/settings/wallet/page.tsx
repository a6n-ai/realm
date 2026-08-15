import { CoinsIcon } from "lucide-react";
import { desc } from "drizzle-orm";
import { PageHeader, PageShell } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { appEvent, coinRate, eventPayout } from "@/db/schema";
import { PayoutGrid, type PayoutRow } from "./payout-grid";
import { CoinRateForm } from "./coin-rate-form";

export const dynamic = "force-dynamic";

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

  // app_event is the source of truth for which rows exist, not the table —
  // nothing seeds event_payout, so an event never saved here still needs to
  // render as a row: disabled, 0 coins (see ./actions.ts for the ship-off ruling).
  const savedByEvent = new Map(savedPayouts.map((p) => [p.eventType, p]));
  const payouts: PayoutRow[] = appEvent.enumValues.map(
    (eventType) => savedByEvent.get(eventType) ?? { eventType, enabled: false, coins: 0 },
  );

  return (
    <PageShell>
      <PageHeader icon={CoinsIcon} title="Wallet" subtitle="Coin earning rules and the coin-to-CAD exchange rate." />
      <div className="grid gap-6">
        <PayoutGrid payouts={payouts} />
        <CoinRateForm current={latestRate ?? null} />
      </div>
    </PageShell>
  );
}
