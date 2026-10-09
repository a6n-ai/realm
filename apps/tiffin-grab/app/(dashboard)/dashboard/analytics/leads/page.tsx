import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { DistributionDonutChart } from "@/components/analytics/charts";
import { inquiriesHref } from "@/lib/analytics/drill";
import {
  getLeadStats,
  getLeadsByStage,
  getLostReasonBreakdown,
  getSourcePerformance,
} from "@/lib/services/analytics/leads.service";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

type SearchParams = Promise<AnalyticsSearchParams>;

export default function LeadsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads by stage" subtitle="Open a stage to see those inquiries.">
          <Suspense fallback={<ChartSkeleton />}>
            <StageChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Lost reasons" subtitle="Among leads marked lost">
          <Suspense fallback={<ChartSkeleton />}>
            <LostReasonChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>

      <ChartCard title="Source performance" subtitle="Leads and conversion rate by source. Open a source to see those inquiries.">
        <Suspense fallback={<ChartSkeleton />}>
          <SourceTable searchParams={searchParams} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const s = await getLeadStats(parseAnalyticsFilters(await searchParams));
  return (
    <MetricTiles
      cols={4}
      items={[
        { label: "Total leads", value: s.total, href: inquiriesHref() },
        { label: "Converted", value: s.converted, href: inquiriesHref({ stage: "converted" }) },
        { label: "Lost", value: s.lost, href: inquiriesHref({ stage: "lost" }) },
        {
          label: "Conversion rate",
          value: `${s.conversionRatePct}%`,
          hint: s.total === 0 ? "No leads yet" : `${s.converted} of ${s.total}`,
          href: inquiriesHref({ stage: "converted" }),
        },
      ]}
    />
  );
}

async function StageChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getLeadsByStage(parseAnalyticsFilters(await searchParams));
  return (
    <BreakdownList
      rows={rows.map((r) => ({ label: r.stage, n: r.n, href: inquiriesHref({ stage: r.key }) }))}
      emptyLabel="No leads yet."
    />
  );
}

async function LostReasonChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getLostReasonBreakdown(parseAnalyticsFilters(await searchParams));
  return <DistributionDonutChart data={rows} nameKey="reason" valueKey="n" />;
}

async function SourceTable({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getSourcePerformance(parseAnalyticsFilters(await searchParams));
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.source,
        n: r.total,
        meta: `${r.converted} converted · ${r.conversionRatePct}%`,
        href: inquiriesHref({ source: r.key }),
      }))}
      emptyLabel="No leads yet."
    />
  );
}
