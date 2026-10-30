/* eslint-disable react-hooks/purity */
import { cache, Suspense } from "react";
import { BanknoteIcon, TrendingUpIcon } from "lucide-react";
import { paymentsHref, zonedRangeMs } from "@/lib/analytics/drill";
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
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import {
  clockInZone,
  currentMonth,
  type Grain,
  type ProfitabilityKpis,
} from "@/lib/analytics/profitability";
import { parseAnalyticsFilters } from "@/lib/services/analytics/shared-filters";
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

type SearchParams = Promise<{
  view?: string;
  month?: string;
  from?: string;
  to?: string;
  plan?: string;
  mealSize?: string;
  zone?: string;
}>;

export default function ProfitabilityAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Profitability"
        description="Earned revenue minus variable and allocated costs under your assumptions."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-10 w-full max-w-xl animate-pulse rounded-xl" />}>
            <Nav searchParams={searchParams} />
          </Suspense>
        }
      />

      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <Headline searchParams={searchParams} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-8">
          <AnalyticsPanel padding="lg" className="flex flex-col gap-4">
            <AnalyticsPanelHeader
              title="By period"
              subtitle="Revenue is allocated to the day the tiffin went out, not the day the customer paid."
            />
            <Suspense fallback={<ChartSkeleton height={320} />}>
              <Grid searchParams={searchParams} />
            </Suspense>
          </AnalyticsPanel>
        </div>
        <div className="lg:col-span-4">
          <Suspense fallback={<ChartSkeleton height={180} />}>
            <Assumptions searchParams={searchParams} />
          </Suspense>
        </div>
      </div>

      <ChartCard
        title="Profit trend"
        subtitle="Earned revenue minus variable and allocated costs. Not cash collected."
      >
        <Suspense fallback={<ChartSkeleton />}>
          <Trend searchParams={searchParams} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

const loadReport = cache(
  async (month: string, grain: Grain, from: string, to: string, plan: string, mealSize: string, zone: string) =>
    getProfitabilityReport({
      month,
      grain,
      filters: await parseAnalyticsFilters({ from, to, plan, mealSize, zone }),
    }),
);

async function reportFrom(searchParams: SearchParams) {
  const sp = await searchParams;
  const { timezone } = await getAppSettings();
  const month = parseMonth(sp.month, currentMonth(timezone));
  const grain = parseGrain(sp.view);
  return loadReport(
    month,
    grain,
    sp.from ?? "",
    sp.to ?? "",
    sp.plan ?? "",
    sp.mealSize ?? "",
    sp.zone ?? "",
  );
}

async function Nav({ searchParams }: { searchParams: SearchParams }) {
  const [report, { timezone }] = await Promise.all([reportFrom(searchParams), getAppSettings()]);
  return (
    <GrainNav
      view={report.grain}
      month={report.month}
      aside={<LiveRefresh updatedLabel={clockInZone(Date.now(), timezone)} refreshAt={report.nextCutoffAt} />}
    />
  );
}

async function Headline({ searchParams }: { searchParams: SearchParams }) {
  const [report, { timezone }] = await Promise.all([reportFrom(searchParams), getAppSettings()]);
  const range = zonedRangeMs(report.from, report.to, timezone);
  return (
    <HeadlineCards
      kpis={report.kpis}
      grain={report.grain}
      cashHref={paymentsHref({ statuses: SETTLED_STATUSES, fromMs: range.from, toMs: range.to })}
    />
  );
}

function HeadlineCards({ kpis, grain, cashHref }: { kpis: ProfitabilityKpis; grain: Grain; cashHref: string }) {
  const rangeHint =
    grain === "monthly" ? "Last 12 months" : grain === "weekly" ? "Weeks in this month" : "This month";

  const items: MetricTile[] = [
    {
      label: "Cash collected",
      value: money(kpis.cashCollected),
      hint: `What customers actually paid, incl. tax. ${rangeHint}.`,
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

async function Trend({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <TrendLineChart data={report.trend} xKey="period" yKey="profit" />;
}

async function Grid({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <ProfitTable rows={report.rows} grain={report.grain} />;
}

async function Assumptions({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <AssumptionsForm current={report.assumptions} />;
}
