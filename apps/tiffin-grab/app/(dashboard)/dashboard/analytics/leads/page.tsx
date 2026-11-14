import { scopeOrAlert } from "@/components/dashboard/analytics/franchise-unavailable";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsIntro } from "@/components/dashboard/analytics/analytics-intro";
import { ChartCard } from "@/components/dashboard/analytics/chart-card";
import { ChartSkeleton } from "@/components/dashboard/analytics/skeletons";
import { BreakdownList } from "@/components/dashboard/analytics/breakdown-list";
import { AnalyticsStatCards, AnalyticsStatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import { BreakdownBarChart, FunnelChart, SankeyChart } from "@/components/dashboard/analytics/charts";
import type { Tone } from "@/components/dashboard/analytics/chart-math";
import { buildSourceFlow } from "@/lib/analytics/source-flow";
import { reachedStages } from "@/lib/analytics/lead-funnel";
import { inquiriesHref } from "@/lib/analytics/drill";
import {
  getLeadStats,
  getLeadsByStage,
  getLostReasonBreakdown,
  getSourcePerformance,
} from "@/lib/analytics/leads.service";
import { DATE_BASIS_LABEL } from "@/lib/analytics/metrics/scope";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function LeadsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/leads", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro description="Inquiries by stage, why they were lost, and which sources convert." />
      <Suspense fallback={<AnalyticsStatCardsSkeleton rows={1} />}>
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Lead stages" subtitle="How far leads got in the pipeline" info="Each step counts leads that reached at least that stage: a converted lead passed through every earlier one. Lost leads count only in All leads, since we do not know where they dropped out.">
          <Suspense fallback={<ChartSkeleton />}>
            <StageChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Where each source's leads went" subtitle="Source to converted, lost or still open" info="Leads in range by source and where they are now. Top 5 sources, the rest folded into Other. Overall conversion is in the cards above.">
          <Suspense fallback={<ChartSkeleton />}>
            <ConversionChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Source performance" subtitle="Leads and conversion rate by source" info="Open a source to see those inquiries.">
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
  const s = await getLeadStats(scope);
  return (
    <AnalyticsStatCards
      items={[
        { label: "Total leads", value: s.total, hint: `Inquiries received · ${DATE_BASIS_LABEL.leads}`, href: inquiriesHref(scope, {}), badge: "In range", badgeTone: "neutral" },
        {
          label: "Converted",
          value: s.converted,
          hint: `Inquiries that became an order · ${DATE_BASIS_LABEL.leads}`,
          href: inquiriesHref(scope, { stage: "converted" }),
          badge: "Won",
          badgeTone: "ok",
        },
        {
          label: "Lost",
          value: s.lost,
          hint: `Inquiries marked lost · ${DATE_BASIS_LABEL.leads}`,
          href: inquiriesHref(scope, { stage: "lost" }),
          tone: s.lost > 0 ? "warn" : undefined,
          badge: "Lost",
          badgeTone: s.lost > 0 ? "warn" : "neutral",
        },
        {
          label: "Conversion rate",
          value: `${s.conversionRatePct}%`,
          hint: s.total === 0 ? "No leads yet" : `Converted leads divided by all leads · ${DATE_BASIS_LABEL.leads}`,
          href: inquiriesHref(scope, { stage: "converted" }),
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

const STAGE_TONE: Record<string, Tone> = { new: "c2", contacted: "c3", follow_up: "c5", converted: "success", lost: "destructive" };

async function StageChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getLeadsByStage(scope);
  const counts = Object.fromEntries(rows.map((r) => [r.key, r.n]));
  const lost = counts.lost ?? 0;
  return (
    <FunnelChart
      steps={reachedStages(counts).map(({ key, reached }, i) => ({
        label: i === 0 ? "All leads" : STAGE_NAME[key]!,
        value: reached,
        tone: STAGE_TONE[key],
        // Only the ends match a stage filter exactly; middle steps also count leads that moved on.
        href: i === 0 ? inquiriesHref(scope, {}) : key === "converted" ? inquiriesHref(scope, { stage: key }) : undefined,
      }))}
      footnote={
        <Link href={inquiriesHref(scope, { stage: "lost" })} className="hover:text-foreground transition-colors">
          {lost.toLocaleString()} lost
        </Link>
      }
    />
  );
}

const STAGE_NAME: Record<string, string> = { new: "Lead", contacted: "Responded", follow_up: "Follow-up", converted: "Took plan/trial" };

async function ConversionChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getSourcePerformance(scope);
  const { nodes, links } = buildSourceFlow(rows);
  return <SankeyChart nodes={nodes} links={links} />;
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
