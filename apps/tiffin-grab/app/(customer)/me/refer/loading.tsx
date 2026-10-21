import { Skeleton } from "@/components/customer/kit";
import { ReferSkeleton } from "@/components/customer/refer/refer-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Skeleton className="h-16 w-64" />
      <ReferSkeleton />
    </div>
  );
}
