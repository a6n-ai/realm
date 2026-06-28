import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, SectionCard, SkeletonPageHeader, SkeletonTable, SkeletonListRows } from "@/components/ds";

export default function Loading() {
  return (
    <PageShell>
      <SkeletonPageHeader />
      <SectionCard title="Summary">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-56" />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Lifecycle">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-40" />
        </div>
      </SectionCard>
      <SectionCard title="Coming week meals">
        <SkeletonTable columns={4} rows={7} />
      </SectionCard>
      <SectionCard title="Activity">
        <SkeletonListRows rows={5} />
      </SectionCard>
    </PageShell>
  );
}
