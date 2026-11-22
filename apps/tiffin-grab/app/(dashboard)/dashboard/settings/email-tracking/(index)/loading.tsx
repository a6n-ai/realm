import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <SectionCard title="How email tracking works">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <Skeleton className="h-12 w-full" />
        </div>
      </SectionCard>
    </div>
  );
}
