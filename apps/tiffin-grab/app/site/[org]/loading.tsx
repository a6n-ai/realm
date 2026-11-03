import { Skeleton } from "@/components/customer/kit";

// Inside PublicShell: the header stays, the page intro and first band hold their place.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="tg-wrap py-16">
      <div className="mb-10 max-w-[720px] space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full max-w-lg" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    </div>
  );
}
