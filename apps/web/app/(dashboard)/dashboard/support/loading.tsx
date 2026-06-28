import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard, SkeletonListRows } from "@/components/ds";
import { LifeBuoyIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={LifeBuoyIcon} title="Support" actions={<Skeleton className="h-9 w-32" />} />
      <SectionCard title="My tickets">
        <SkeletonListRows rows={5} />
      </SectionCard>
    </PageShell>
  );
}
