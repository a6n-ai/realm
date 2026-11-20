import { Skeleton } from "@foundry/ui/skeleton";
import { AnalyticsStatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { AnalyticsIntro } from "@/components/dashboard/analytics/analytics-intro";
import { ChartCard } from "@/components/dashboard/analytics/chart-card";

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

export type ChartFrame = { title: string; height?: number };

// A tab before its data: the intro and every chart card keep their real title, only the data is a skeleton.
export function AnalyticsTabSkeleton({ description, statRows = 1, rows }: { description: string; statRows?: 1 | 2; rows: ChartFrame[][] }) {
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro description={description} />
      <AnalyticsStatCardsSkeleton rows={statRows} />
      {rows.map((row) => (
        <div key={row.map((f) => f.title).join("|")} className={row.length > 1 ? "grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5" : undefined}>
          {row.map((f) => (
            <ChartCard key={f.title} title={f.title}>
              <ChartSkeleton height={f.height} />
            </ChartCard>
          ))}
        </div>
      ))}
    </div>
  );
}
