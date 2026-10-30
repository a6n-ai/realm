import { Skeleton } from "@foundry/ui/skeleton";

// Tab body while it loads; the header, stats and tab bar come from the layout.
export default function CustomerTabLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
