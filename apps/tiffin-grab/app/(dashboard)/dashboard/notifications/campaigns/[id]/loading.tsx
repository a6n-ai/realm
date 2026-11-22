import { BackButton } from "@foundry/design-system";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <BackButton href="/dashboard/notifications/campaigns" label="All campaigns" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <Skeleton className="h-9 w-56" />
      <div className="space-y-6 pt-4">
        <SectionCard title="Results">
          <Skeleton className="h-24 w-full" />
        </SectionCard>
        <SectionCard title="Content">
          <Skeleton className="h-40 w-full" />
        </SectionCard>
        <SectionCard title="Unsubscribed">
          <Skeleton className="h-10 w-full" />
        </SectionCard>
      </div>
    </div>
  );
}
