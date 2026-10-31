/* eslint-disable react-hooks/purity */
import { cache, Suspense } from "react";
import { BanknoteIcon, TrendingUpIcon } from "lucide-react";
import { paymentsHref } from "@/lib/analytics/drill";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { TrendLineChart } from "@/components/analytics/charts";
import { MetricFootnote, MetricTiles, type MetricTile } from "@/components/analytics/metric-tiles";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import {
  AnalyticsBadge,
  AnalyticsPanel,
  AnalyticsPanelHeader,
} from "@/components/analytics/analytics-panel";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import {
  clockInZone,
  currentMonth,
  navScope,
  type Grain,
  type ProfitabilityKpis,
} from "@/lib/analytics/profitability";
import { LiveRefresh } from "@/components/analytics/live-refresh";
import { AssumptionsForm } from "./assumptions-form";
import { GrainNav } from "./grain-nav";
import { ProfitTable } from "./profit-table";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function pct(n: number | null) {
  return n == null ? "—" : `${n.toFixed(1)}%`;
}

function parseGrain(raw: string | undefined): Grain {
  if (raw === "weekly" || raw === "monthly" || raw === "daily") return raw;
  return "daily";
}

function parseMonth(raw: string | undefined, fallback: string): string {
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : fallback;
}

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function ProfitabilityAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const resolved = await scopeOrAlert("/dashboard/analytics/profitability", sp);
  if (!resolved.scope) return resolved.alert;
  const month = parseMonth(sp.month, currentMonth(resolved.scope.tz));
  const grain = parseGrain(sp.view);
  // GrainNav writes ?view=&month= with no from/to; an explicit date filter wins over it.
  const scope = navScope(resolved.scope, sp.from != null || sp.to != null, month, grain);
  const view = { month, grain, scope };
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Profitability"
        description="Earned revenue minus variable and allocated costs under your assumptions."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-10 w-full max-w-xl animate-pulse rounded-xl" />}>
            <Nav view={view} />
          </Suspense>
        }
      />

      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <Headline view={view} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-8">
          <AnalyticsPanel padding="lg" className="flex flex-col gap-4">
            <AnalyticsPanelHeader
              title="By period"
              subtitle="Revenue is allocated to the day the tiffin went out, not the day the customer paid."
            />
            <Suspense fallback={<ChartSkeleton height={320} />}>
              <Grid view={view} />
            </Suspense>
          </AnalyticsPanel>
        </div>
        <div className="lg:col-span-4">
          <Suspense fallback={<ChartSkeleton height={180} />}>
            <Assumptions view={view} />
          </Suspense>
        </div>
      </div>

      <ChartCard
        title="Profit trend"
        subtitle="Earned revenue minus variable and allocated costs. Not cash collected."
      >
        <Suspense fallback={<ChartSkeleton />}>
          <Trend view={view} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

type View = { month: string; grain: Grain; scope: AnalyticsScope };

// Keyed by the scope object, so the sections of one render share a single report.
const loadReport = cache((month: string, grain: Grain, scope: AnalyticsScope) =>
  getProfitabilityReport({ month, grain, scope }),
);

const reportFrom = ({ month, grain, scope }: View) => loadReport(month, grain, scope);

async function Nav({ view }: { view: View }) {
  const report = await reportFrom(view);
  const timezone = view.scope.tz;
  return (
    <GrainNav
      view={report.grain}
      month={report.month}
      aside={<LiveRefresh updatedLabel={clockInZone(Date.now(), timezone)} refreshAt={report.nextCutoffAt} />}
    />
  );
}

async function Headline({ view }: { view: View }) {
  const report = await reportFrom(view);
  return (
    <HeadlineCards
      kpis={report.kpis}
      range={`${report.from} to ${report.to}`}
      cashHref={paymentsHref(view.scope, { statuses: SETTLED_STATUSES, basis: "money" })}
    />
  );
}

function HeadlineCards({ kpis, range, cashHref }: { kpis: ProfitabilityKpis; range: string; cashHref: string }) {
  const rangeHint = range;

  const items: MetricTile[] = [
    {
      label: "Cash collected",
      value: money(kpis.cashCollected),
      hint: `Paid minus refunds, incl. tax, excl. card surcharge · ${DATE_BASIS_LABEL.money}. Equals Revenue net collected.`,
      href: cashHref,
      badge: "Settled",
      badgeTone: "neutral",
      footer: (
        <MetricFootnote>
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <BanknoteIcon className="size-3.5" aria-hidden />
            Open settled payments
          </span>
        </MetricFootnote>
      ),
    },
    {
      label: "Revenue earned",
      value: money(kpis.revenue),
      hint: `Value of paid tiffins delivered, excl. tax. ${rangeHint}.`,
      badge: "Delivered",
      badgeTone: "ok",
      footer:
        kpis.unpaidRevenue > 0 ? (
          <MetricFootnote>
            <span className="text-muted-foreground">Not paid yet</span>
            <span className="text-warn font-semibold tabular-nums">{money(kpis.unpaidRevenue)}</span>
          </MetricFootnote>
        ) : (
          <MetricFootnote>
            <span className="text-muted-foreground">Allocated on delivery day</span>
            <AnalyticsBadge tone="ok">Current</AnalyticsBadge>
          </MetricFootnote>
        ),
    },
    {
      label: "Profit margin",
      value: pct(kpis.marginPct),
      hint: `Net profit ${money(kpis.profit)} after assumed costs.`,
      tone: kpis.profit < 0 ? "bad" : "ok",
      badge: kpis.profit < 0 ? "Below target" : "Net",
      badgeTone: kpis.profit < 0 ? "warn" : "ok",
      footer: (
        <MetricFootnote>
          <span className="text-muted-foreground">Total costs</span>
          <span className="text-foreground font-semibold tabular-nums">{money(kpis.costs)}</span>
        </MetricFootnote>
      ),
    },
    {
      label: "Avg profit / tiffin",
      value: kpis.profitPerTiffin == null ? "—" : money(kpis.profitPerTiffin),
      hint: "Earned revenue minus costs, per delivered tiffin.",
      tone: kpis.profitPerTiffin != null && kpis.profitPerTiffin < 0 ? "bad" : "default",
      badge: "Per tiffin",
      badgeTone: "brand",
      footer: (
        <MetricFootnote>
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <TrendingUpIcon className="size-3.5" aria-hidden />
            Under current assumptions
          </span>
        </MetricFootnote>
      ),
    },
  ];

  return <MetricTiles cols={4} items={items} />;
}

async function Trend({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <TrendLineChart data={report.trend} xKey="period" yKey="profit" />;
}

async function Grid({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <ProfitTable rows={report.rows} grain={report.grain} />;
}

async function Assumptions({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <AssumptionsForm current={report.assumptions} />;
}
