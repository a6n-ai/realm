import { SectionCard, SkeletonStatCards, SkeletonFilterBar, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonStatCards count={3} className="sm:grid-cols-3" />
      <SectionCard title="Templates">
        <div className="space-y-4">
          <SkeletonFilterBar dropdown />
          <SkeletonTable columns={4} />
        </div>
      </SectionCard>
    </div>
  );
}
