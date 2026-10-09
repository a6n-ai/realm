import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, DistributionDonutChart } from "@/components/analytics/charts";
import {
  getOperationsStats,
  getDeliveryStatusMix,
  getRouteLoadByDriver,
} from "@/lib/services/analytics/operations.service";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

type SearchParams = Promise<AnalyticsSearchParams>;

export default function OperationsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Delivery status mix">
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Route load per driver" subtitle="Deliveries synced from OptimoRoute">
          <Suspense fallback={<ChartSkeleton />}>
            <DriverChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const s = await getOperationsStats(parseAnalyticsFilters(await searchParams));
  return (
    <StatGrid
      cols={4}
      items={[
        { label: "Total deliveries", value: s.totalDeliveries },
        { label: "Skipped", value: s.skipped },
        { label: "Cancelled", value: s.cancelled },
        { label: "Skip rate", value: `${s.skipRatePct}%` },
      ]}
    />
  );
}

async function MixChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getDeliveryStatusMix(parseAnalyticsFilters(await searchParams));
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}

async function DriverChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getRouteLoadByDriver(10, parseAnalyticsFilters(await searchParams));
  return <BreakdownBarChart data={rows} xKey="driver" yKey="n" />;
}
