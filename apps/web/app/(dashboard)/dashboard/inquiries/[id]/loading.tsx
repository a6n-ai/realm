import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, SectionCard, SkeletonPageHeader, SkeletonListRows } from "@/components/ds";

export default function Loading() {
  return (
    <PageShell>
      <SkeletonPageHeader />
      <SectionCard title="Details">
        <div className="space-y-3">
          <Skeleton className="h-9 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
          <Skeleton className="h-16 w-full" />
        </div>
      </SectionCard>
      <SectionCard title="Activity">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <SkeletonListRows rows={8} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
