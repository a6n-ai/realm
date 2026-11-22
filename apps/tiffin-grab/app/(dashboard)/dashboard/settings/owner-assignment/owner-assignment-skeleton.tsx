import { Card } from "@foundry/ui/card";
import { Separator } from "@foundry/ui/separator";
import { Skeleton } from "@foundry/ui/skeleton";

export function OwnerAssignmentSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="size-8" />
                <Skeleton className="size-4 rounded-full" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-4 w-32" />
        <Card className="gap-0 py-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              {i > 0 && <Separator />}
              <div className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-[18px] w-8 rounded-full" />
              </div>
            </div>
          ))}
          <Separator />
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-56" />
          </div>
        </Card>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}
