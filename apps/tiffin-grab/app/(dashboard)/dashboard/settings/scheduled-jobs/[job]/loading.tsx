import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonPageHeader } from "@/components/ds";
import { RunsTableSkeleton } from "./runs-table";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <SkeletonPageHeader subtitle />
      <SectionCard title="Overview">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {["Schedule", "Next run", "Last run"].map((label) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>
                <Skeleton className="mt-1 h-5 w-32" />
              </dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <SectionCard title="Run history">
        <RunsTableSkeleton />
      </SectionCard>
    </div>
  );
}
