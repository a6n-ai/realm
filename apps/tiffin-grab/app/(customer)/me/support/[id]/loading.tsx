import { PageHeader, Skeleton } from "@/components/customer/kit";
import { TicketThreadSkeleton } from "@/components/customer/support/ticket-thread";

// Same fixed-height frame as the thread page so the chat window doesn't jump.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto flex h-[calc(100dvh-177px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-2xl flex-col gap-3 lg:h-[calc(100dvh-129px)]">
      <div className="shrink-0">
        <div className="mb-2 flex min-h-11 items-center lg:hidden"><Skeleton className="h-5 w-20" /></div>
        <PageHeader eyebrow="Support ticket" title="Support ticket" />
      </div>
      <TicketThreadSkeleton />
    </div>
  );
}
