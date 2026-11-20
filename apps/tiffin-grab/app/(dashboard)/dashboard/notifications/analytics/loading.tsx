import { AnalyticsStatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { ChartCard } from "@/components/dashboard/analytics/chart-card";
import { ChartSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsStatCardsSkeleton rows={1} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="By channel" subtitle="Where every queued notification is headed.">
          <ChartSkeleton />
        </ChartCard>
        <ChartCard title="By status" subtitle="Delivered, failed, or still in flight.">
          <ChartSkeleton />
        </ChartCard>
      </div>
    </div>
  );
}
