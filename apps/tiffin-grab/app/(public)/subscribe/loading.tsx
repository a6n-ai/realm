import { Skeleton } from "@/components/customer/kit";
import { ChromeSkeleton } from "@/components/wizard/flow-skeleton";

// Same frame as the page: top bar, title, coupon preview, then the sign-in step.
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" role="status" className="customer-app mx-auto w-full max-w-3xl px-4 pb-4 sm:pb-10">
      <ChromeSkeleton />
      <div className="space-y-3 pb-2">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-5 w-full max-w-sm" />
      </div>
      <Skeleton className="mt-5 h-20 rounded-[20px]" />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-[50px] rounded-full" />
        <Skeleton className="h-12" />
        <Skeleton className="h-[50px] w-40" />
      </div>
    </main>
  );
}
