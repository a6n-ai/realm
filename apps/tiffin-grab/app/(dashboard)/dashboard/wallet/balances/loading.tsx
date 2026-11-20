import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { BalancesTableSkeleton } from "./balances-table";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
        </div>
        <StatCardsSkeleton count={5} />
      </div>
      <SectionCard title="Balances" subtitle="Balance and Value are as of the end of the selected range; Earned and Redeemed are within it.">
        <BalancesTableSkeleton />
      </SectionCard>
    </div>
  );
}
