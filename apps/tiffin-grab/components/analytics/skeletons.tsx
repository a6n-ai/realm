import { Skeleton } from "@foundry/ui/skeleton";

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}
