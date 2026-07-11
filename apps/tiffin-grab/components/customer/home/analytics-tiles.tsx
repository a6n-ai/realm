"use client";

import { Skeleton } from "@realm/ui/skeleton";
import { SectionCard, StatGrid } from "@/components/ds";

export function AnalyticsTiles({
  deliveriesThisMonth,
  totalSpend,
  totalSavings,
}: {
  deliveriesThisMonth: number;
  totalSpend: string;
  totalSavings: string;
}) {
  return (
    <SectionCard title="Your activity">
      <StatGrid
        cols={3}
        items={[
          { label: "Deliveries this month", value: deliveriesThisMonth },
          { label: "Total spend", value: `$${totalSpend}` },
          { label: "Savings", value: `$${totalSavings}` },
        ]}
      />
    </SectionCard>
  );
}

// Named skeleton twin — a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function AnalyticsTilesSkeleton() {
  return (
    <SectionCard title="Your activity">
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    </SectionCard>
  );
}
