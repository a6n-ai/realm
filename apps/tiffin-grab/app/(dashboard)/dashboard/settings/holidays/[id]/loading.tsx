import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <SkeletonPageHeader action subtitle />
      <SkeletonStatCards count={4} />
      <SectionCard title="What needs doing">
        <Skeleton className="h-6 w-2/3" />
      </SectionCard>
      <SectionCard title="Closed deliveries">
        <SkeletonTable columns={5} rows={5} />
      </SectionCard>
    </div>
  );
}
