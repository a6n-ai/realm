import { Card, Skeleton } from "@/components/customer/kit";
import { BottomBarSkeleton } from "@/components/wizard/bottom-bar-skeleton";
import { ChromeSkeleton } from "@/components/wizard/chrome-skeleton";
import { ProgressSkeleton } from "@/components/wizard/progress-skeleton";

// Quick renew's one-page Plan step inside Checkout's frame: top bar with total chip, stepper, heading,
// plan card, start date, weeks slider, schedule card, order summary (md+) and the action bar.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-5xl pb-[calc(7rem+1rem)] sm:pb-10">
      <ChromeSkeleton chip />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:items-start lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="min-w-0">
          <ProgressSkeleton />
          <Skeleton className="mb-6 h-9 w-64 sm:h-[42px]" />
          <div className="flex flex-col gap-6">
            <Card className="px-4 py-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-[26px] w-40" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-1 h-[18px] w-44" />
              <div className="mt-3 flex flex-wrap gap-2">
                <Skeleton className="h-11 w-28 rounded-full" />
                <Skeleton className="h-11 w-44 rounded-full" />
              </div>
            </Card>
            <div className="space-y-6">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-[52px]" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-44" />
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full rounded-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-[22px] w-48" />
                </div>
              </div>
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-12" />
                </div>
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12" />)}
              </Card>
            </div>
          </div>
          <BottomBarSkeleton />
        </div>
        <aside aria-hidden className="hidden md:block">
          <Skeleton className="h-80 rounded-3xl" />
        </aside>
      </div>
    </div>
  );
}
