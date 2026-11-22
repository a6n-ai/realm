import { TagIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";

// Mirrors LabelsData.Skeleton in page.tsx; a page file cannot export it.
export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader
          icon={TagIcon}
          title="Daily labels"
          subtitle="Kitchen packing sheet and container labels for one delivery day."
        />
        <SectionCard title="Day">
          <Skeleton className="h-9 w-64" />
        </SectionCard>
        <StatCardsSkeleton count={5} />
        <Skeleton className="h-9 w-full max-w-xl" />
        <SectionCard title="Packing sheet">
          <Skeleton className="h-96 w-full" />
        </SectionCard>
      </PageShell>
    </div>
  );
}
