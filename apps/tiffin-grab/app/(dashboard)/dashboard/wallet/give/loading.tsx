import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { Skeleton } from "@foundry/ui/skeleton";
import { GiveHistoryTableSkeleton } from "./give-history-table";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
          <Skeleton className="h-9 w-56" />
        </div>
        <StatCardsSkeleton count={5} />
      </div>
      <SectionCard title="Grant history" subtitle="Every coin grant, with the staff member who gave it.">
        <GiveHistoryTableSkeleton />
      </SectionCard>
    </div>
  );
}
