import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myDeliveries } from "@/lib/services/customer-deliveries.service";
import { couponsService } from "@/lib/services/coupons.service";
import { ledgerService } from "@/lib/services/ledger.service";
import { walletService } from "@/lib/services/wallet.service";
import { parseFilterState } from "@/components/ds";
import { WalletHero } from "@/components/customer/wallet/wallet-hero";
import { EarnSpendTiles } from "@/components/customer/wallet/earn-spend-tiles";
import { WalletLog, WalletLogSkeleton } from "@/components/customer/wallet/wallet-log";
import { WALLET_FACETS } from "@/components/customer/wallet/wallet-facets";
import { CouponsSection, CouponsSectionSkeleton } from "@/components/customer/home/coupons-section";
import { AnalyticsTiles, AnalyticsTilesSkeleton } from "@/components/customer/home/analytics-tiles";
import { monthWindow } from "@/components/customer/home/analytics-month-window";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function MyWalletPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { timezone } = await getAppSettings();

  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Wallet</h1>
        <p className="text-muted-foreground text-sm text-pretty">Track coins you've earned and spent.</p>
      </header>
      <Suspense fallback={<WalletLogSkeleton />}>
        <MyWalletData userId={userId} searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<CouponsSectionSkeleton />}>
        <CouponsSectionData />
      </Suspense>
      <Suspense fallback={<AnalyticsTilesSkeleton />}>
        <AnalyticsTilesData userId={userId} timezone={timezone} />
      </Suspense>
    </main>
  );
}

async function MyWalletData({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
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

// Catalog-wide coupon list — active, non-rep coupons in window. Not user-owned data,
// so no userId gate (mirrors browse plans on the home page).
async function CouponsSectionData() {
  const coupons = await couponsService.listAvailable();
  return <CouponsSection coupons={coupons} />;
}

// Session-scoped: the month window is computed from the APP timezone (never the
// server's UTC clock — spec 6), and every read below is scoped to `userId`.
async function AnalyticsTilesData({ userId, timezone }: { userId: bigint; timezone: string }) {
  const { from, until } = monthWindow(Date.now(), timezone);
  const [deliveriesThisMonth, totalSpend, totalSavings] = await Promise.all([
    myDeliveries(userId, from, until),
    ledgerService.totalSpent(userId),
    ledgerService.totalSavings(userId),
  ]);
  return (
    <AnalyticsTiles
      deliveriesThisMonth={deliveriesThisMonth.length}
      totalSpend={totalSpend}
      totalSavings={totalSavings}
    />
  );
}
