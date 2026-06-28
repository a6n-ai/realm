import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, SectionCard, SkeletonPageHeader, SkeletonListRows } from "@/components/ds";

export default function Loading() {
  return (
    <PageShell>
      <SkeletonPageHeader />
      <SectionCard title="Details">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Conversation">
        <SkeletonListRows rows={4} />
      </SectionCard>
    </PageShell>
  );
}
