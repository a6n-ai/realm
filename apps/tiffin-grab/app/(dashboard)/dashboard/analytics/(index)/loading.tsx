import { AnalyticsStatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { ChartSkeleton } from "@/components/dashboard/analytics/skeletons";

// Tab chrome (header, tab nav) comes from the layout; each tab's own chart titles load with its data.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsStatCardsSkeleton rows={2} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}
