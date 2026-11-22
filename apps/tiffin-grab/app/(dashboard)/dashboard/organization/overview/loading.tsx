import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { RecentActivitySkeleton } from "./recent-activity";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <StatCardsSkeleton count={5} />
      <SectionCard title="Needs attention" subtitle="Things to fix before they block someone.">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-5 w-48" />
        </div>
      </SectionCard>
      <SectionCard title="Recent activity" subtitle="Invites sent and staff who joined, newest first.">
        <RecentActivitySkeleton />
      </SectionCard>
    </div>
  );
}
