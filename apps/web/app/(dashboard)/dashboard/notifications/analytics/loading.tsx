import { SkeletonStatCards } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonStatCards count={5} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
      <div className="space-y-3 rounded-lg border p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
