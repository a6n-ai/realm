import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard, SkeletonFilterBar, SkeletonTable } from "@/components/ds";
import { PackageIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title="Orders" actions={<Skeleton className="h-9 w-32" />} />
      <SectionCard title="All orders">
        <div className="space-y-4">
          <SkeletonFilterBar pills={6} />
          <SkeletonTable columns={8} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
