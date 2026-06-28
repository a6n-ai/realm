import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard, SkeletonFilterBar, SkeletonTable } from "@/components/ds";
import { UsersIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customers" actions={<Skeleton className="h-9 w-32" />} />
      <SectionCard title="All customers">
        <div className="space-y-4">
          <SkeletonFilterBar />
          <SkeletonTable columns={5} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
