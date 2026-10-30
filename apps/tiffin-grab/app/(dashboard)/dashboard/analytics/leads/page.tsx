import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { MetricFootnote, MetricTiles } from "@/components/analytics/metric-tiles";
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
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Leads"
        description="Inquiries by stage, why they were lost, and which sources convert."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-7 w-28 animate-pulse rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
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
  const s = await getLeadStats(await parseAnalyticsFilters(await searchParams));
  return (
    <MetricTiles
      cols={4}
      items={[
        { label: "Total leads", value: s.total, href: inquiriesHref(), badge: "In range", badgeTone: "neutral" },
        {
          label: "Converted",
          value: s.converted,
          href: inquiriesHref({ stage: "converted" }),
          badge: "Won",
          badgeTone: "ok",
        },
        {
          label: "Lost",
          value: s.lost,
          href: inquiriesHref({ stage: "lost" }),
          tone: s.lost > 0 ? "warn" : "default",
          badge: "Lost",
          badgeTone: s.lost > 0 ? "warn" : "neutral",
        },
        {
          label: "Conversion rate",
          value: `${s.conversionRatePct}%`,
          hint: s.total === 0 ? "No leads yet" : "Converted leads divided by all leads",
          href: inquiriesHref({ stage: "converted" }),
          badge: "Rate",
          badgeTone: "brand",
          footer:
            s.total === 0 ? undefined : (
              <MetricFootnote>
                <span className="text-muted-foreground">Converted</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {s.converted} of {s.total}
                </span>
              </MetricFootnote>
            ),
        },
      ]}
    />
  );
}

async function StageChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getLeadsByStage(await parseAnalyticsFilters(await searchParams));
  return (
    <BreakdownList
      rows={rows.map((r) => ({ label: r.stage, n: r.n, href: inquiriesHref({ stage: r.key }) }))}
      emptyLabel="No leads yet."
    />
  );
}

async function LostReasonChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getLostReasonBreakdown(await parseAnalyticsFilters(await searchParams));
  return <DistributionDonutChart data={rows} nameKey="reason" valueKey="n" />;
}

async function SourceTable({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getSourcePerformance(await parseAnalyticsFilters(await searchParams));
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
