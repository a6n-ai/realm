import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard, SkeletonListRows } from "@/components/ds";
import { SaladIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={SaladIcon} title="Dishes" />
      <SectionCard title="Manage dishes">
        <div className="space-y-3">
          <Skeleton className="h-9 w-24" />
          <SkeletonListRows rows={8} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
