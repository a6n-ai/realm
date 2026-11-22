import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { SectionCard } from "@/components/ds";
import { CustomerWalletTableSkeleton } from "./customer-wallet-table";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <StatCardsSkeleton count={5} />
      <SectionCard title="Wallet ledger" subtitle="Every coin earned, redeemed or given to this customer.">
        <CustomerWalletTableSkeleton />
      </SectionCard>
    </div>
  );
}
