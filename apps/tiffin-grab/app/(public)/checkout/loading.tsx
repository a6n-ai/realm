import { Skeleton } from "@/components/customer/kit";
import { BottomBarSkeleton } from "@/components/wizard/bottom-bar-skeleton";
import { ChromeSkeleton } from "@/components/wizard/chrome-skeleton";
import { ProgressSkeleton } from "@/components/wizard/progress-skeleton";

// Checkout's frame: top bar, then stepper + step sections beside the order summary, then the action bar.
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-5xl px-4 pb-[calc(7rem+1rem)] sm:pb-10">
      <ChromeSkeleton />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:items-start lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="min-w-0">
          <ProgressSkeleton />
          <Skeleton className="mb-6 h-10 w-56 sm:h-11" />
          <div className="space-y-10">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ))}
          </div>
          <BottomBarSkeleton />
        </div>
        <Skeleton className="h-80 rounded-[20px]" />
      </div>
    </main>
  );
}
