import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton, ListSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, DistributionDonutChart } from "@/components/analytics/charts";
import {
  getLeadStats,
  getLeadsByStage,
  getLostReasonBreakdown,
  getSourcePerformance,
} from "@/lib/services/analytics/leads.service";

export default function LeadsAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads by stage">
          <Suspense fallback={<ChartSkeleton />}>
            <StageChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Lost reasons" subtitle="Among leads marked lost">
          <Suspense fallback={<ChartSkeleton />}>
            <LostReasonChart />
          </Suspense>
        </ChartCard>
      </div>

      <ChartCard title="Source performance" subtitle="Leads and conversion rate by source">
        <Suspense fallback={<ListSkeleton />}>
          <SourceTable />
        </Suspense>
      </ChartCard>
    </div>
  );
}

async function StatsData() {
  const s = await getLeadStats();
  return (
    <StatGrid
      cols={4}
      items={[
        { label: "Total leads", value: s.total },
        { label: "Converted", value: s.converted },
        { label: "Lost", value: s.lost },
        { label: "Conversion rate", value: `${s.conversionRatePct}%` },
      ]}
    />
  );
}

async function StageChart() {
  const rows = await getLeadsByStage();
  return <BreakdownBarChart data={rows} xKey="stage" yKey="n" />;
}

async function LostReasonChart() {
  const rows = await getLostReasonBreakdown();
  return <DistributionDonutChart data={rows} nameKey="reason" valueKey="n" />;
}

async function SourceTable() {
  const rows = await getSourcePerformance();
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">No data yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.source} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{r.source}</span>
          <span className="tabular-nums">
            <span className="font-medium">{r.converted}</span>
            <span className="text-muted-foreground"> / {r.total} ({r.conversionRatePct}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
