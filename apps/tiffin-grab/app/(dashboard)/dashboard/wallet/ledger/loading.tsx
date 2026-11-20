import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { LedgerTableSkeleton } from "./ledger-table";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
        </div>
        <StatCardsSkeleton count={5} />
      </div>
      <SectionCard title="Ledger" subtitle="Every coin earned, redeemed or given. A text search spans all dates.">
        <LedgerTableSkeleton />
      </SectionCard>
    </div>
  );
}
