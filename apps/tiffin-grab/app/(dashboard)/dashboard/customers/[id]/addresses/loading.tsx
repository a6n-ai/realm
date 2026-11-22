import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <SectionCard title="Saved addresses" action={<Skeleton className="h-9 w-32" />}>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
