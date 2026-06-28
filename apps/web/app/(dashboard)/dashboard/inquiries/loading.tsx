import { Skeleton } from "@/components/ui/skeleton";
import {
  PageShell, PageHeader, SectionCard, SkeletonStatCards, SkeletonFilterBar, SkeletonTable,
} from "@/components/ds";
import { ClipboardListIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={ClipboardListIcon} title="Inquiries" actions={<Skeleton className="h-9 w-32" />} />
      <SkeletonStatCards count={3} className="sm:grid-cols-3" />
      <SectionCard title="All inquiries">
        <div className="space-y-4">
          <SkeletonFilterBar pills={7} dropdown />
          <SkeletonTable columns={8} />
        </div>
      </SectionCard>
    </PageShell>
  );
}
