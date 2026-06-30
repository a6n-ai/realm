import { SectionCard, SkeletonStatCards, SkeletonFilterBar, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonStatCards count={4} className="sm:grid-cols-2 lg:grid-cols-4" />
      <SectionCard title="Templates">
        <div className="space-y-4">
          <SkeletonFilterBar dropdown />
          <SkeletonTable columns={5} />
        </div>
      </SectionCard>
    </div>
  );
}
