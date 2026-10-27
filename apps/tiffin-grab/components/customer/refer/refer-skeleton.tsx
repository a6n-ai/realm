import { Card, Skeleton } from "@/components/customer/kit";
import { H2Skeleton, ListGroupSkeleton, StatGroupSkeleton, StepListSkeleton } from "@/components/customer/skeleton-parts";

/** Mirrors ReferView: offer StatGroup, code pass card, how-it-works StepList, coins StatGroup, friends ListGroup. */
export function ReferSkeleton() {
  return (
    <div className="space-y-6">
      <StatGroupSkeleton />
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="space-y-1">
            <Skeleton className="h-[22px] w-36" />
            <Skeleton className="h-[18px] w-28" />
          </div>
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-[color-mix(in_oklch,var(--foreground)_7%,transparent)] px-4 py-4">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="mt-3 h-9 w-28 rounded-full" />
        </div>
        <Skeleton className="mx-auto h-[18px] w-3/4" />
        <Skeleton className="h-11 rounded-full" />
      </Card>
      <section className="space-y-3">
        <H2Skeleton className="w-36" />
        <StepListSkeleton />
      </section>
      <section className="space-y-3">
        <H2Skeleton className="w-28" />
        <StatGroupSkeleton />
      </section>
      <section className="space-y-3">
        <H2Skeleton className="w-32" />
        <ListGroupSkeleton rows={2} tile={false} />
      </section>
    </div>
  );
}
