import { Skeleton } from "@foundry/ui/skeleton";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { PageShell, SectionCard, SkeletonPageHeader, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <SkeletonPageHeader action />
        <StatCardsSkeleton count={5} />
        <Skeleton className="h-9 w-56" />
        <SectionCard title="Members">
          <SkeletonTable columns={5} rows={6} />
        </SectionCard>
      </PageShell>
    </div>
  );
}
