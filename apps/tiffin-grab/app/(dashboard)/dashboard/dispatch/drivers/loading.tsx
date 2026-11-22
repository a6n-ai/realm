import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonTable } from "@/components/ds";
import { DispatchChrome } from "../dispatch-chrome";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <DispatchChrome>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-80" />
        </div>
        <Skeleton className="h-24 w-full" />
        <SectionCard title="Assign drivers">
          <SkeletonTable columns={5} rows={6} />
        </SectionCard>
      </DispatchChrome>
    </div>
  );
}
