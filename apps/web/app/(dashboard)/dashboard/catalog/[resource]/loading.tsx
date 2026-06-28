import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, SectionCard, SkeletonPageHeader, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <PageShell>
      <SkeletonPageHeader />
      <SectionCard title="Entries">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-24" />
          </div>
          <SkeletonTable columns={4} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
