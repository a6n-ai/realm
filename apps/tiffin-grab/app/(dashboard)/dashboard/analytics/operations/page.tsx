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

export default function OperationsAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Delivery status mix">
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Route load per driver" subtitle="Deliveries synced from OptimoRoute">
          <Suspense fallback={<ChartSkeleton />}>
            <DriverChart />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData() {
  const s = await getOperationsStats();
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

async function MixChart() {
  const rows = await getDeliveryStatusMix();
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}

async function DriverChart() {
  const rows = await getRouteLoadByDriver();
  return <BreakdownBarChart data={rows} xKey="driver" yKey="n" />;
}
