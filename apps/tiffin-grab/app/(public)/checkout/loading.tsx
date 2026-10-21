import { Skeleton } from "@/components/customer/kit";

// Order summary beside the payment card, as the page lays them out.
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-10">
      <Skeleton className="mb-6 h-9 w-56" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    </main>
  );
}
