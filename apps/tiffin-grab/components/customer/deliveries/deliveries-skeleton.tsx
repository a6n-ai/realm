import { Card, Skeleton } from "@/components/customer/kit";

/** Mirrors the live layout: header, week strip (mobile), timeline / detail / rail (desktop). */
export function DeliveriesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading deliveries" role="status">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-44 rounded-full" />
        </div>
      </div>
      <div className="mb-4 flex gap-2 md:hidden">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[52px] min-w-11 flex-1 rounded-[14px]" />)}
      </div>
      <div className="grid gap-6 md:grid-cols-[300px_1fr] lg:grid-cols-[320px_1fr_340px]">
        <Card className="hidden space-y-2 p-4 md:block">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}
        </Card>
        <Card className="space-y-4 p-5">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-12" />
          <Skeleton className="h-28" />
        </Card>
        <div className="hidden space-y-6 lg:block">
          <Card className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}
          </Card>
          <Card className="p-4"><Skeleton className="h-56" /></Card>
        </div>
      </div>
    </div>
  );
}
