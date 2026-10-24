import { Skeleton } from "@/components/customer/kit";
import { BottomBarSkeleton, ChromeSkeleton, ProgressSkeleton } from "@/components/wizard/flow-skeleton";

// Quick renew's frame (top bar, stepper, heading, plan card, week cards, action bar), so nothing jumps when it lands.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-3xl pb-[calc(7rem+1rem)] sm:pb-6">
      <ChromeSkeleton />
      <ProgressSkeleton />
      <Skeleton className="mb-6 h-10 w-64 sm:h-11" />
      <div className="flex flex-col gap-6">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
        </div>
      </div>
      <BottomBarSkeleton />
    </div>
  );
}
