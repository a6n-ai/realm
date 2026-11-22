import { ChartColumnIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { PageHeader, PageShell } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader icon={ChartColumnIcon} title="Stat cards demo" subtitle="Sample numbers. One card, a cell per metric." />
        <section className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <StatCardsSkeleton count={5} />
        </section>
      </PageShell>
    </div>
  );
}
