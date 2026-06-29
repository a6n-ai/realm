import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="ml-auto h-6 w-20" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[520px] w-full rounded-xl" />
    </div>
  );
}
