import { Skeleton } from "@/components/customer/kit";
import { BottomBarSkeleton } from "@/components/wizard/bottom-bar-skeleton";
import { ChromeSkeleton } from "@/components/wizard/chrome-skeleton";
import { ProgressSkeleton } from "@/components/wizard/progress-skeleton";

// Checkout's frame: top bar with total chip, then stepper + heading + order glance + step sections beside the order summary, then the action bar.
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-5xl px-4 pb-[calc(7rem+1rem)] sm:pb-10">
      <ChromeSkeleton chip />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:items-start lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="min-w-0">
          <ProgressSkeleton />
          <Skeleton className="mb-6 h-9 w-56 sm:h-[42px]" />
          <Skeleton className="mb-8 h-[72px] rounded-3xl md:hidden" />
          <div className="space-y-10">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-[52px]" />
                <Skeleton className="h-[52px]" />
              </div>
            ))}
          </div>
          <BottomBarSkeleton />
        </div>
        <aside aria-hidden className="hidden md:block">
          <Skeleton className="h-80 rounded-3xl" />
        </aside>
      </div>
    </main>
  );
}
