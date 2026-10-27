import { PageHeader } from "@/components/customer/kit";
import { FinanceStatsSkeleton } from "@/components/customer/wallet/finance-stats";
import { CoinsPanelSkeleton } from "@/components/customer/wallet/wallet-log";
import { TabsSkeleton } from "@/components/customer/skeleton-parts";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader eyebrow="Account" title="Your" accent="finances." subtitle="Coins, bills, and money transactions in one place." />
      <FinanceStatsSkeleton />
      <TabsSkeleton />
      <CoinsPanelSkeleton />
    </div>
  );
}
