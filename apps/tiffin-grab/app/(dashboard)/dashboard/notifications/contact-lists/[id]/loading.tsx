import { BackButton } from "@foundry/design-system";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonStatCards } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <BackButton href="/dashboard/notifications/contact-lists" label="All lists" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <SkeletonStatCards count={1} className="md:grid-cols-1" />
      <SectionCard title="Add a contact" subtitle="For a handful of people — no spreadsheet needed.">
        <Skeleton className="h-9 w-full" />
      </SectionCard>
      <SectionCard title="Contacts" subtitle="Convert a contact into a full customer account.">
        <Skeleton className="h-48 w-full" />
      </SectionCard>
    </div>
  );
}
