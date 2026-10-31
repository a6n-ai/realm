import { getSession } from "@/lib/auth/session";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { Skeleton } from "@foundry/ui/skeleton";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { AnalyticsStatCards, StatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import { BreakdownBarChart, RadialRateChart, SegmentedBar } from "@/components/analytics/charts";
import type { Tone } from "@/components/analytics/chart-math";
import { inquiriesHref } from "@/lib/analytics/drill";
import {
  getLeadStats,
  getLeadsByStage,
  getLostReasonBreakdown,
  getSourcePerformance,
} from "@/lib/services/analytics/leads.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function LeadsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/leads", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="Inquiries by stage, why they were lost, and which sources convert."
        action={
          <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Lead stages" subtitle="Where every lead in range sits in the pipeline.">
          <Suspense fallback={<ChartSkeleton />}>
            <StageChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Conversion rate" subtitle="Converted leads out of all leads.">
          <Suspense fallback={<ChartSkeleton />}>
            <ConversionChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Source performance" subtitle="Leads and conversion rate by source. Open a source to see those inquiries.">
          <Suspense fallback={<ChartSkeleton />}>
            <SourceTable scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Lost reasons" subtitle="Among leads marked lost">
          <Suspense fallback={<ChartSkeleton />}>
            <LostReasonChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const [s, visible] = await Promise.all([getLeadStats(scope), resolveSessionVisibleOrgIds(await getSession())]);
  return (
    <AnalyticsStatCards
      items={[
        { label: "Total leads", value: s.total, hint: `Inquiries received · ${DATE_BASIS_LABEL.leads}`, href: inquiriesHref(scope, {}, visible), badge: "In range", badgeTone: "neutral" },
        {
          label: "Converted",
          value: s.converted,
          hint: `Inquiries that became an order · ${DATE_BASIS_LABEL.leads}`,
          href: inquiriesHref(scope, { stage: "converted" }, visible),
          badge: "Won",
          badgeTone: "ok",
        },
        {
          label: "Lost",
          value: s.lost,
          hint: `Inquiries marked lost · ${DATE_BASIS_LABEL.leads}`,
          href: inquiriesHref(scope, { stage: "lost" }, visible),
          tone: s.lost > 0 ? "warn" : undefined,
          badge: "Lost",
          badgeTone: s.lost > 0 ? "warn" : "neutral",
        },
        {
          label: "Conversion rate",
          value: `${s.conversionRatePct}%`,
          hint: s.total === 0 ? "No leads yet" : `Converted leads divided by all leads · ${DATE_BASIS_LABEL.leads}`,
          href: inquiriesHref(scope, { stage: "converted" }, visible),
          badge: "Rate",
          badgeTone: "brand",
          footer:
            s.total === 0 ? undefined : (
              <StatFootnote>
                <span className="text-muted-foreground">Converted</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {s.converted} of {s.total}
                </span>
              </StatFootnote>
            ),
        },
      ]}
    />
  );
}

const STAGE_ORDER = ["new", "contacted", "quoted", "follow_up", "converted", "lost"];
const STAGE_TONE: Record<string, Tone> = { converted: "success", lost: "destructive" };

async function StageChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getLeadsByStage(scope);
  return (
    <SegmentedBar
      withList
      max={6}
      parts={[...rows]
        .sort((a, b) => STAGE_ORDER.indexOf(a.key) - STAGE_ORDER.indexOf(b.key))
        .map((r) => ({ label: r.stage, value: r.n, tone: STAGE_TONE[r.key] ?? "chart" }))}
    />
  );
}

async function ConversionChart({ scope }: { scope: AnalyticsScope }) {
  const s = await getLeadStats(scope);
  return (
    <div className="flex flex-col gap-3">
      <RadialRateChart
        data={s.total === 0 ? [] : [{ label: "Converted", rate: s.conversionRatePct }]}
        nameKey="label"
        valueKey="rate"
      />
      {s.total > 0 ? (
        <p className="text-muted-foreground text-center text-sm">
          <span className="text-foreground font-semibold tabular-nums">
            {s.converted.toLocaleString()} of {s.total.toLocaleString()}
          </span>{" "}
          leads converted
        </p>
      ) : null}
    </div>
  );
}

async function LostReasonChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getLostReasonBreakdown(scope);
  return <BreakdownBarChart data={rows} xKey="reason" yKey="n" label="Leads lost" />;
}

async function SourceTable({ scope }: { scope: AnalyticsScope }) {
  const rows = await getSourcePerformance(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.source,
        n: r.total,
        meta: `${r.converted} converted · ${r.conversionRatePct}%`,
        href: inquiriesHref(scope, { source: r.key }),
      }))}
      emptyLabel="No leads yet."
    />
  );
}
