import { Card, Skeleton } from "@/components/customer/kit";

/** Mirrors SupportHoursNote (full): tile + status + pill, day strip, hours chips, reply line. */
export function SupportHoursSkeleton() {
  return (
    <Card className="space-y-4 p-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton className="h-[22px] w-36" />
          <Skeleton className="h-5 w-48 max-w-full" />
        </div>
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 py-2">
            <Skeleton className="h-3.5 w-7 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-1.5 rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-36 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <Skeleton className="h-[18px] w-52 max-w-full" />
    </Card>
  );
}
