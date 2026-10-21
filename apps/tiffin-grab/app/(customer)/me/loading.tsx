import { Card, Skeleton } from "@/components/customer/kit";

// Shown under the customer shell while any /me page renders; deliveries has its own.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status">
      <div className="mb-5 space-y-3 lg:mb-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-6">
        <Card className="space-y-4 p-5 lg:p-8">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24" />
          <Skeleton className="h-12" />
        </Card>
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </div>
    </div>
  );
}
