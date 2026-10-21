import { Skeleton } from "@/components/customer/kit";

// Same frame as the page: header bar, title, then the email step.
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" role="status" className="customer-app mx-auto w-full max-w-3xl px-4 py-4 sm:py-10">
      <Skeleton className="mb-6 h-10" />
      <div className="mb-6 space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-sm" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12 w-40" />
      </div>
    </main>
  );
}
