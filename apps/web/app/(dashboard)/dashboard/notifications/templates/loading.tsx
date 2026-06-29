import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-9 w-full" />
      <div className="divide-y overflow-hidden rounded-lg border">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-[4.75rem] rounded-full" />
              <Skeleton className="h-5 w-[4.75rem] rounded-full" />
              <Skeleton className="size-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
