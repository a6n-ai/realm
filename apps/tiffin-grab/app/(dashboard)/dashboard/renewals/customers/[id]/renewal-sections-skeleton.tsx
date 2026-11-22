import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonStatCards } from "@/components/ds";

// Stats plus the three cards RenewalSections paints.
export function RenewalSectionsSkeleton() {
  return (
    <>
      <SkeletonStatCards count={5} />
      <SectionCard title="Follow-up" subtitle="The plan that is running, or the last one.">
        <Skeleton className="h-24 w-full" />
      </SectionCard>
      <SectionCard title="Plan history" subtitle="Oldest first. Each plan shows what came after it.">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
      <SectionCard title="Renewal reminders" subtitle="Emails sent 5 days and 1 day before a plan's last tiffin.">
        <Skeleton className="h-24 w-full" />
      </SectionCard>
    </>
  );
}
