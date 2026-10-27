import { PageHeader, Skeleton } from "@/components/customer/kit";
import { HowSupportWorks } from "@/components/customer/support/how-support-works";
import { SupportHoursSkeleton } from "@/components/customer/support/support-skeletons";
import { TicketsListSkeleton } from "@/components/customer/support/tickets-list";
import { TopicCards } from "@/components/customer/support/topic-cards";

// Same order as the page; topic tiles and how-it-works are static, so they render for real.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Support"
        title="How can we"
        accent="help?"
        subtitle="Pick a topic or start a new ticket. We reply right here."
        action={<Skeleton className="h-11 w-32 rounded-full" />}
      />
      <SupportHoursSkeleton />
      <TopicCards />
      <TicketsListSkeleton />
      <HowSupportWorks />
    </div>
  );
}
