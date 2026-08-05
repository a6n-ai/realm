import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, DistributionDonutChart } from "@/components/analytics/charts";
import {
  getComplaintStats,
  getTicketStatusMix,
  getTicketsByCategory,
  getTicketsByPriority,
} from "@/lib/services/analytics/complaints.service";

export default function ComplaintsAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Status">
          <Suspense fallback={<ChartSkeleton />}>
            <StatusChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Category">
          <Suspense fallback={<ChartSkeleton />}>
            <CategoryChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Priority">
          <Suspense fallback={<ChartSkeleton />}>
            <PriorityChart />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData() {
  const s = await getComplaintStats();
  return (
    <StatGrid
      cols={4}
      items={[
        { label: "Total tickets", value: s.total },
        { label: "Open", value: s.open },
        { label: "Resolved / closed", value: s.resolved },
        { label: "Avg. resolution time", value: s.avgResolutionHours != null ? `${s.avgResolutionHours}h` : "—" },
      ]}
    />
  );
}

async function StatusChart() {
  const rows = await getTicketStatusMix();
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}

async function CategoryChart() {
  const rows = await getTicketsByCategory();
  return <BreakdownBarChart data={rows} xKey="category" yKey="n" />;
}

async function PriorityChart() {
  const rows = await getTicketsByPriority();
  return <BreakdownBarChart data={rows} xKey="priority" yKey="n" />;
}
