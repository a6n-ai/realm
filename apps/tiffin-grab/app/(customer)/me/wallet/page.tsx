import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/services/wallet.service";
import { parseFilterState } from "@/components/ds";
import { WalletHero } from "@/components/customer/wallet/wallet-hero";
import { EarnSpendTiles } from "@/components/customer/wallet/earn-spend-tiles";
import { WalletLog, WalletLogSkeleton } from "@/components/customer/wallet/wallet-log";
import { WALLET_FACETS } from "@/components/customer/wallet/wallet-facets";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function MyWalletPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Wallet</h1>
        <p className="text-muted-foreground text-sm text-pretty">Track coins you've earned and spent.</p>
      </header>
      <Suspense fallback={<WalletLogSkeleton />}>
        <MyWalletData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MyWalletData({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { currency } = await getAppSettings();
  const { condition, page } = parseFilterState(WALLET_FACETS, await searchParams);

  const [balance, { earned, spent }, ledger] = await Promise.all([
    walletService.balance(userId),
    walletService.earnSpendTotals(userId),
    walletService.ledgerPage(userId, condition, page),
  ]);
  const money = await walletService.moneyValue(balance, currency);

  return (
    <div className="space-y-4">
      <WalletHero coins={balance} money={money} currency={currency} />
      <EarnSpendTiles earned={earned} spent={spent} />
      <WalletLog items={ledger.items} page={ledger.page} size={ledger.size} total={ledger.total} />
    </div>
  );
}
