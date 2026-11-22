import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { DeliveriesSectionSkeleton } from "./deliveries-section";
import { TabSkeleton } from "./tab-skeleton";

export function OrderDetailSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <StatCardsSkeleton count={5} />
      <Skeleton className="h-9 w-full max-w-md" />
      <TabSkeleton
        deliveries={<DeliveriesSectionSkeleton />}
        overview={
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <SectionCard key={i} title={i === 0 ? "Plan & schedule" : "Customer & delivery"}>
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-full" />
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        }
      />
    </>
  );
}
