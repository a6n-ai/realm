import { Skeleton } from "@/components/customer/kit";

/** Mirrors DeliveriesView: greeting + plan card, then week strip (left) beside the day's eating card (right). */
export function DeliveriesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading deliveries" role="status" className="pb-14 lg:pb-0">
      <div className="mb-4 lg:mb-6">
        <Skeleton className="h-9 w-40 lg:h-11" />
        <div className="mt-4 space-y-2 rounded-[20px] border-[1.5px] border-[var(--border)] px-4 py-3.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-full max-w-sm" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2 border-t border-[var(--border)] pt-3 lg:justify-end">
            <Skeleton className="h-11 flex-1 rounded-[14px] lg:w-28 lg:flex-none" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div className="rounded-[20px] border-[1.5px] border-[var(--border)] px-3 pb-2 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-36 rounded-full" />
            <div className="flex gap-1">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="size-9 rounded-full" />
            </div>
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 py-2">
                <Skeleton className="h-3 w-6 rounded-full" />
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-[26px] w-3 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-9">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16 rounded-full" />
            <Skeleton className="h-8 w-56 lg:h-10" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-20 rounded-full" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          </div>
          <div className="hidden space-y-3 lg:block">
            <Skeleton className="h-[50px] rounded-[14px]" />
            <Skeleton className="h-[50px] rounded-[14px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
