import { PageHeader, Skeleton } from "@/components/customer/kit";
import { NewTicketFormSkeleton } from "@/components/customer/support/new-ticket-form";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto max-w-2xl space-y-6">
      <div className="flex min-h-11 items-center lg:hidden"><Skeleton className="h-5 w-20" /></div>
      <PageHeader eyebrow="Support" title="New" accent="ticket" subtitle="Tell us what's going on. You can attach photos or screenshots, and link a plan if it helps." />
      <NewTicketFormSkeleton />
    </div>
  );
}
