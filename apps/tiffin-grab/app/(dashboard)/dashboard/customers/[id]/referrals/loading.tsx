import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <SectionCard title="Referral">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Friends referred" subtitle="Each friend who joined with their code, and the coins each side got.">
        <SkeletonTable columns={5} rows={4} />
      </SectionCard>
    </div>
  );
}
