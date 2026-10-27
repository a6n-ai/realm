import { Suspense } from "react";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/services/session-service";
import { stripeMethodAvailable } from "@/lib/payments/stripe";
import { settleStaleOnView } from "@/lib/services/payment-stripe";
import { getAppSettings, getCoinEarnPct } from "@/lib/services/app-settings.service";
import { myBillsPage, myCouponsPage, myCouponTotals, myMoneyLedgerPage } from "@/lib/services/customer-finances.service";
import { couponsService } from "@/lib/services/coupons.service";
import { walletService } from "@/lib/services/wallet.service";
import { parseFilterState } from "@/components/ds";
import { PageHeader } from "@/components/customer/kit";
import { TabsSkeleton } from "@/components/customer/skeleton-parts";
import { getCustomerUsage } from "@/lib/services/customer-usage.service";
import { FinanceStats, FinanceStatsSkeleton } from "@/components/customer/wallet/finance-stats";
import { WalletHero } from "@/components/customer/wallet/wallet-hero";
import { CoinsPanelSkeleton, WalletLog } from "@/components/customer/wallet/wallet-log";
import { WALLET_FACETS } from "@/components/customer/wallet/wallet-facets";
import { BillsList, BillsListSkeleton } from "@/components/customer/wallet/bills-list";
import { TransactionsList, TransactionsListSkeleton } from "@/components/customer/wallet/transactions-list";
import { MONEY_LEDGER_FACETS } from "@/components/customer/wallet/money-ledger-facets";
import { FinancesTabs } from "@/components/customer/wallet/finances-tabs";
import { parseFinancesTab } from "@/components/customer/wallet/finances-tab";
import { CouponsSection, CouponsSectionSkeleton } from "@/components/customer/home/coupons-section";
import { CouponHistory, CouponHistorySkeleton, CouponStats, CouponStatsSkeleton } from "@/components/customer/wallet/coupon-history";

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

      <Suspense fallback={<TabsSkeleton />}>
        <FinancesTabs active={tab} />
      </Suspense>

      {tab === "coins" ? (
        <Suspense fallback={<CoinsPanelSkeleton />}>
          <CoinsPanel userId={userId} searchParams={searchParams} />
        </Suspense>
      ) : null}

      {tab === "coupons" ? (
        <Suspense
          fallback={
            <div className="space-y-6">
              <CouponStatsSkeleton />
              <CouponsSectionSkeleton />
              <CouponHistorySkeleton />
            </div>
          }
        >
          <CouponsPanel userId={userId} searchParams={searchParams} />
        </Suspense>
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

  const [balance, { earned, spent }, ledger, earnPct] = await Promise.all([
    walletService.balance(userId),
    walletService.earnSpendTotals(userId),
    walletService.ledgerPage(userId, condition, page),
    getCoinEarnPct(),
  ]);
  const [money, coinWorth] = await Promise.all([walletService.moneyValue(balance, currency), walletService.moneyValue(1, currency)]);

  return (
    <div className="space-y-4">
      <WalletHero coins={balance} money={money} currency={currency} earned={earned} spent={spent} earnPct={earnPct} coinWorth={coinWorth} />
      <WalletLog items={ledger.items} page={ledger.page} size={ledger.size} total={ledger.total} filtered={condition != null} />
    </div>
  );
}

async function BillsPanel({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
  const { currency } = await getAppSettings();
  const { page } = parseFilterState([], await searchParams);
  const bills = await myBillsPage(userId, page);
  const cardAvailable = await stripeMethodAvailable();
  // Lazy status check on view (no cron): settle card payments the webhook may have missed.
  const unsettled = bills.items
    .flatMap((b) => b.payments)
    .filter((p) => p.method === "stripe" && p.status === "awaiting_payment" && p.providerRef);
  if (unsettled.length) after(() => settleStaleOnView(unsettled));
  return (
    <BillsList
      items={bills.items}
      page={bills.page}
      size={bills.size}
      total={bills.total}
      currency={currency}
      cardAvailable={cardAvailable}
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
      filtered={condition != null}
    />
  );
}

// Live catalog coupons (not user-owned) plus the customer's own uses and savings.
async function CouponsPanel({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
  const { currency } = await getAppSettings();
  const { page } = parseFilterState([], await searchParams);
  const [available, totals, history] = await Promise.all([
    couponsService.listAvailable(userId),
    myCouponTotals(userId),
    myCouponsPage(userId, page),
  ]);
  return (
    <div className="space-y-6">
      <CouponStats available={available.length} saved={totals.saved} currency={currency} />
      <CouponsSection coupons={available} />
      <CouponHistory items={history.items} page={history.page} size={history.size} total={history.total} currency={currency} />
    </div>
  );
}

// All-time totals; usage is computed server-side from the ledger, never client input.
async function StatsData({ userId }: { userId: bigint }) {
  const { currency } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const usage = await getCustomerUsage(userId, 0, Date.now());
  return <FinanceStats usage={usage} currency={currency} />;
}
