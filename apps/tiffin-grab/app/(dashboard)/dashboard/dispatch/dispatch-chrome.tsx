import type { ReactNode } from "react";
import { TruckIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";

export function DispatchChrome({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <PageHeader icon={TruckIcon} title="Dispatch" subtitle="Today's routes and driver assignments." />
      {children}
    </PageShell>
  );
}

export function DispatchSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-80" />
      </div>
      <StatCardsSkeleton count={5} />
      <SectionCard title="Send to OptimoRoute">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </SectionCard>
      <SectionCard title="Stops">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
    </>
  );
}
