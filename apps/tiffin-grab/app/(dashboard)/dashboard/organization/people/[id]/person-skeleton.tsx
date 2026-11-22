import { Skeleton } from "@foundry/ui/skeleton";

export function PersonSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="grid gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
