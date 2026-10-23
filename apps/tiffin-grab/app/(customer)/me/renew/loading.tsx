import { Skeleton } from "@/components/customer/kit";

// Same shape as the quick renew screen (top bar, heading, plan card, start date, week cards), so nothing jumps when it lands.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between border-b py-2">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-11 w-32 rounded-full" />
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-12 rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
      </div>
    </div>
  );
}
