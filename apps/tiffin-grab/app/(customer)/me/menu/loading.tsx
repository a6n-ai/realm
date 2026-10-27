import { Card, Skeleton } from "@/components/customer/kit";

// Mirrors the weekly menu: header, seven-day strip, then the day card with dish groups.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-1 h-6 w-36" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[62px]" />)}
        </div>
        <Card className="flex flex-col gap-5 p-5 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-11 w-32 rounded-full" />
          </div>
          <div className="grid gap-x-8 gap-y-5 border-t border-[var(--border)] pt-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
