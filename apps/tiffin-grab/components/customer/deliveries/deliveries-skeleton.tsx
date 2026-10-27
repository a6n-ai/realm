import { Skeleton } from "@/components/customer/kit";

/** Mirrors DeliveriesView: greeting + plan card, then week strip (left) beside the day's eating card (right), and the phone's floating action bar. */
export function DeliveriesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading deliveries" role="status" className="pb-20 lg:pb-8">
      <header className="mb-4 lg:mb-6">
        <Skeleton className="h-9 w-40 lg:h-11" />
        <div className="c-surface mt-4 rounded-[20px] bg-[var(--card,#fff)] px-4 py-3.5">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="mt-1.5 h-5 w-full max-w-sm" />
          <Skeleton className="mt-0.5 h-4 w-32" />
          <div className="mt-3 flex gap-2 pt-1 lg:justify-end">
            <Skeleton className="h-11 flex-1 rounded-full lg:w-32 lg:flex-none" />
          </div>
        </div>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div className="c-surface rounded-[20px] bg-[var(--card,#fff)] px-3 pb-2 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-36 rounded-full" />
            <div className="flex">
              <div className="grid size-11 place-items-center"><Skeleton className="h-5 w-3 rounded-sm" /></div>
              <div className="grid size-11 place-items-center"><Skeleton className="h-5 w-3 rounded-sm" /></div>
            </div>
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 py-2">
                <Skeleton className="h-3.5 w-7 rounded-full" />
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="size-1.5 rounded-full" />
                <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-9">
          <div className="space-y-2">
            <Skeleton className="mb-1 h-3 w-16 rounded-full" />
            <Skeleton className="h-9 w-56 lg:h-[42px]" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-20 rounded-full" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
            <Skeleton className="mt-2 h-5 w-24" />
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-24 rounded-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-5 w-3/4 max-w-xs" />
            </div>
          </div>
          <div className="hidden space-y-3 lg:block">
            <Skeleton className="h-[50px] rounded-full" />
            <Skeleton className="h-[50px] rounded-full" />
          </div>
        </div>
      </div>
      <div aria-hidden className="c-liquid fixed inset-x-3 bottom-[calc(var(--tabbar-h,4rem)+max(0.75rem,env(safe-area-inset-bottom))+0.5rem)] z-30 flex gap-1 rounded-full p-1 lg:hidden">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[50px] flex-1 rounded-full" />)}
      </div>
    </div>
  );
}
