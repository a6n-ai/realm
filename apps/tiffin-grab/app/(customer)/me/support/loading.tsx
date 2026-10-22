import { PageHeader, Skeleton } from "@/components/customer/kit";
import { TicketsListSkeleton } from "@/components/customer/support/tickets-list";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Support" title="How can we" accent="help?" subtitle="Pick a topic or start a new ticket. We reply right here." />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-[20px]" />)}
      </div>
      <TicketsListSkeleton />
    </div>
  );
}
