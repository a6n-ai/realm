import { getSession } from "@/lib/auth/session";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { Skeleton } from "@foundry/ui/skeleton";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { AnalyticsStatCards, StatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import { BreakdownBarChart, FunnelChart, SankeyChart } from "@/components/analytics/charts";
import type { Tone } from "@/components/analytics/chart-math";
import { buildSourceFlow } from "@/lib/analytics/source-flow";
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Lead stages" subtitle="Where each lead sits now" info="Each lead counts once, at its current stage (not every stage it passed through). Open a stage to see those inquiries.">
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

const STAGE_TONE: Record<string, Tone> = { new: "c2", contacted: "c3", quoted: "c4", follow_up: "c5", converted: "success", lost: "destructive" };

const FUNNEL = ["new", "contacted", "quoted", "follow_up", "converted"] as const;

async function StageChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getLeadsByStage(scope);
  const by = new Map(rows.map((r) => [r.key, r]));
  const lost = by.get("lost")?.n ?? 0;
  return (
    <FunnelChart
      steps={FUNNEL.map((k) => {
        const r = by.get(k);
        return { label: r?.stage ?? STAGE_NAME[k]!, value: r?.n ?? 0, tone: STAGE_TONE[k], href: inquiriesHref(scope, { stage: k }) };
      })}
      footnote={
        <Link href={inquiriesHref(scope, { stage: "lost" })} className="hover:text-foreground transition-colors">
          {lost.toLocaleString()} lost
        </Link>
      }
    />
  );
}

const STAGE_NAME: Record<string, string> = { new: "New", contacted: "Contacted", quoted: "Quoted", follow_up: "Follow-up", converted: "Converted" };

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
