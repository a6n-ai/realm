import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WalletIcon } from "lucide-react";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myDeliveries } from "@/lib/services/customer-deliveries.service";
import { myBillsPage, myMoneyLedgerPage } from "@/lib/services/customer-finances.service";
import { couponsService } from "@/lib/services/coupons.service";
import { ledgerService } from "@/lib/services/ledger.service";
import { walletService } from "@/lib/services/wallet.service";
import { parseFilterState, PageShell, PageHeader } from "@/components/ds";
import { WalletHero } from "@/components/customer/wallet/wallet-hero";
import { EarnSpendTiles } from "@/components/customer/wallet/earn-spend-tiles";
import { WalletLog, WalletLogSkeleton } from "@/components/customer/wallet/wallet-log";
import { WALLET_FACETS } from "@/components/customer/wallet/wallet-facets";
import { BillsList, BillsListSkeleton } from "@/components/customer/wallet/bills-list";
import { TransactionsList, TransactionsListSkeleton } from "@/components/customer/wallet/transactions-list";
import { MONEY_LEDGER_FACETS } from "@/components/customer/wallet/money-ledger-facets";
import { FinancesTabs } from "@/components/customer/wallet/finances-tabs";
import { parseFinancesTab } from "@/components/customer/wallet/finances-tab";
import { CouponsSection, CouponsSectionSkeleton } from "@/components/customer/home/coupons-section";
import { AnalyticsTiles, AnalyticsTilesSkeleton } from "@/components/customer/home/analytics-tiles";
import { monthWindow } from "@/components/customer/home/analytics-month-window";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function MyWalletPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const sp = await searchParams;
  const tab = parseFinancesTab(sp.tab);
  const { timezone } = await getAppSettings();

  return (
    <PageShell>
      <PageHeader
        icon={WalletIcon}
        title="Finances"
        subtitle="Coins, bills, and money transactions in one place."
      />

      <Suspense fallback={null}>
        <FinancesTabs active={tab} />
      </Suspense>

      {tab === "coins" ? (
        <>
          <Suspense fallback={<WalletLogSkeleton />}>
            <CoinsPanel userId={userId} searchParams={searchParams} />
          </Suspense>
          <Suspense fallback={<CouponsSectionSkeleton />}>
            <CouponsSectionData />
          </Suspense>
          <Suspense fallback={<AnalyticsTilesSkeleton />}>
            <AnalyticsTilesData userId={userId} timezone={timezone} />
          </Suspense>
        </>
      ) : null}

      {tab === "bills" ? (
        <Suspense fallback={<BillsListSkeleton />}>
          <BillsPanel userId={userId} searchParams={searchParams} />
        </Suspense>
      ) : null}

      {tab === "transactions" ? (
        <Suspense fallback={<TransactionsListSkeleton />}>
          <TransactionsPanel userId={userId} searchParams={searchParams} />
        </Suspense>
      ) : null}
    </PageShell>
  );
}

async function CoinsPanel({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
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
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-stretch">
        <WalletHero coins={balance} money={money} currency={currency} />
        <EarnSpendTiles earned={earned} spent={spent} />
      </div>
      <WalletLog items={ledger.items} page={ledger.page} size={ledger.size} total={ledger.total} />
    </div>
  );
}

async function BillsPanel({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
  const { currency } = await getAppSettings();
  const { page } = parseFilterState([], await searchParams);
  const bills = await myBillsPage(userId, page);
  return (
    <BillsList
      items={bills.items}
      page={bills.page}
      size={bills.size}
      total={bills.total}
      currency={currency}
    />
  );
}

async function TransactionsPanel({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
  const { currency } = await getAppSettings();
  const { condition, page } = parseFilterState(MONEY_LEDGER_FACETS, await searchParams);
  const ledger = await myMoneyLedgerPage(userId, condition, page);
  return (
    <TransactionsList
      items={ledger.items}
      page={ledger.page}
      size={ledger.size}
      total={ledger.total}
      currency={currency}
    />
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
