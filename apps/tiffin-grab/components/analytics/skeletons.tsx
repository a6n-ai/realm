import { Skeleton } from "@realm/ui/skeleton";

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between text-sm">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}
