import { Skeleton } from "@/components/customer/kit";

/** Progress's shape: one 4px segment plus label per step. */
export function ProgressSkeleton({ steps = 3 }: { steps?: number }) {
  return (
    <div className="mb-6 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}>
      {Array.from({ length: steps }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-1 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}
