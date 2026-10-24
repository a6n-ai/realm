import { PageHeader, Skeleton } from "@/components/customer/kit";
import { TicketsListSkeleton } from "@/components/customer/support/tickets-list";

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
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      </div>
      <TicketsListSkeleton />
    </div>
  );
}
