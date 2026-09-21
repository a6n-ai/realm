import { Card, Skeleton } from "@/components/customer/kit";

/** Mirrors the live layout: title + plan line, week strip, week's trip list + one detail card. */
export function DeliveriesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading deliveries" role="status">
      <div className="mb-5 space-y-3 lg:mb-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="mb-4 rounded-2xl border border-[var(--border)] p-2">
        <Skeleton className="mb-2 h-4 w-28" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[68px] rounded-[14px]" />)}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:gap-8">
        <div className="space-y-1">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
        <Card className="space-y-4 p-5 lg:p-8">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24" />
          <Skeleton className="hidden h-[50px] lg:block" />
        </Card>
      </div>
    </div>
  );
}
