import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myBillsPage, myMoneyLedgerPage } from "@/lib/services/customer-finances.service";
import { couponsService } from "@/lib/services/coupons.service";
import { walletService } from "@/lib/services/wallet.service";
import { parseFilterState } from "@/components/ds";
import { PageHeader, Skeleton } from "@/components/customer/kit";
import { getCustomerUsage } from "@/lib/services/customer-usage.service";
import { FinanceStats, FinanceStatsSkeleton } from "@/components/customer/wallet/finance-stats";
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

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function MyWalletPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const sp = await searchParams;
  const tab = parseFinancesTab(sp.tab);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader eyebrow="Account" title="Your" accent="finances." subtitle="Coins, bills, and money transactions in one place." />

      <Suspense fallback={<FinanceStatsSkeleton />}>
        <StatsData userId={userId} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-11 w-72 rounded-full" />}>
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
    </div>
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

// All-time totals; usage is computed server-side from the ledger, never client input.
async function StatsData({ userId }: { userId: bigint }) {
  const { currency } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const usage = await getCustomerUsage(userId, 0, Date.now());
  return <FinanceStats usage={usage} currency={currency} />;
}
