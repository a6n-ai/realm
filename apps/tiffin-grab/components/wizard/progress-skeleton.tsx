import { Skeleton } from "@/components/customer/kit";

/** Progress's shape: an icon tile + name/note per step, joined by chevrons. */
export function ProgressSkeleton({ steps = 3 }: { steps?: number }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-1.5 sm:justify-start sm:gap-3">
      {Array.from({ length: steps }, (_, i) => (
        <div key={i} className="contents">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-[10px]" />
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="h-3 w-9" />
            </div>
          </div>
          {i < steps - 1 && <Skeleton className="h-4 w-2.5 shrink-0 rounded-sm" />}
        </div>
      ))}
    </div>
  );
}
