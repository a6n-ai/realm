import { BackButton } from "@foundry/design-system";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonFormCard, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <BackButton href="/dashboard/organization/settings" label="Clients" className="self-start" />
      <header className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
      </header>
      <SkeletonFormCard fields={5} />
      <SectionCard title="Staff" subtitle="Staff who belong to this client, and their roles in it.">
        <SkeletonTable columns={3} rows={3} />
      </SectionCard>
    </div>
  );
}
