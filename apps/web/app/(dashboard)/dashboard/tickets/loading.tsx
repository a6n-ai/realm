import { Skeleton } from "@/components/ui/skeleton";
import {
  PageShell, PageHeader, SectionCard, SkeletonStatCards, SkeletonFilterBar, SkeletonTable,
} from "@/components/ds";
import { LifeBuoyIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={LifeBuoyIcon} title="Tickets" actions={<Skeleton className="h-9 w-32" />} />
      <SkeletonStatCards count={3} className="sm:grid-cols-3" />
      <SectionCard title="All tickets">
        <div className="space-y-4">
          <SkeletonFilterBar pills={6} dropdown />
          <SkeletonTable columns={7} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
