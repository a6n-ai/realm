import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, SectionCard, SkeletonPageHeader, SkeletonListRows } from "@/components/ds";

export default function Loading() {
  return (
    <PageShell>
      <SkeletonPageHeader />
      <SectionCard title="Profile">
        <div className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
      </SectionCard>
      <SectionCard title="Orders">
        <SkeletonListRows rows={8} />
      </SectionCard>
      <SectionCard title="Inquiries">
        <SkeletonListRows rows={5} />
      </SectionCard>
      <SectionCard title="Activity timeline">
        <SkeletonListRows rows={6} />
      </SectionCard>
    </PageShell>
  );
}
