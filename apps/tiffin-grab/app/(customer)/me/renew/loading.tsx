import { Skeleton } from "@/components/customer/kit";

// Header copy depends on whether a plan is running, so it stays a skeleton; the wizard body is a card stack.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-3xl space-y-4">
      <div className="space-y-2 pb-2">
        <Skeleton className="h-7 w-56 sm:h-9" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-12 rounded-full" />
    </div>
  );
}
