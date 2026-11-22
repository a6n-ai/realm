import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <SectionCard title="Activity" subtitle="Every change on this customer's orders and account, by staff, the customer or the system.">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
