import { Skeleton } from "@foundry/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-72 w-full" />
      ))}
    </div>
  );
}
