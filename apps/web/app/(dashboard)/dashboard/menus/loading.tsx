import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard, SkeletonCardGrid } from "@/components/ds";
import { CalendarIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={CalendarIcon} title="Weekly Menus" />
      <SectionCard title="Menu builder">
        <div className="grid max-w-md gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-full" />
        </div>
      </SectionCard>
      <SectionCard title="Past menus">
        <SkeletonCardGrid count={3} />
      </SectionCard>
    </PageShell>
  );
}
