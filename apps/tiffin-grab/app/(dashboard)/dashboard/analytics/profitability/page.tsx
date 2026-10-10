/* eslint-disable react-hooks/purity */
import { cache, Suspense } from "react";
import Link from "next/link";
import { BanknoteIcon, TrendingUpIcon } from "lucide-react";
import { paymentsHref, zonedRangeMs } from "@/lib/analytics/drill";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { Card, SkeletonStatCards, StatGrid } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { TrendLineChart } from "@/components/analytics/charts";
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
    <div className="space-y-6">
      <Suspense fallback={<div className="bg-muted/40 h-10 animate-pulse rounded-lg" />}>
        <Nav searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <Headline searchParams={searchParams} />
      </Suspense>

      <ChartCard
        title="Profit trend"
        subtitle="Earned revenue minus variable and allocated costs. Not cash collected."
      >
        <Suspense fallback={<ChartSkeleton />}>
          <Trend searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <ChartCard title="By period" subtitle="Revenue is allocated to the day the tiffin went out, not the day the customer paid.">
        <Suspense fallback={<ChartSkeleton height={320} />}>
          <Grid searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <Suspense fallback={<ChartSkeleton height={180} />}>
        <Assumptions searchParams={searchParams} />
      </Suspense>
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
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={cashHref} className="hover-lift focus-visible:ring-ring block rounded-xl outline-none focus-visible:ring-2">
          <Card className="h-full p-4">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <BanknoteIcon className="size-3.5" />
              Cash collected
            </p>
            <p className="nums mt-1 text-2xl font-semibold tabular-nums">{money(kpis.cashCollected)}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">What customers actually paid, incl. tax. {rangeHint}.</p>
          </Card>
        </Link>
        <Card className="p-4">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <TrendingUpIcon className="size-3.5" />
            Revenue earned
          </p>
          <p className="nums mt-1 text-2xl font-semibold tabular-nums">{money(kpis.revenue)}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Value of paid tiffins delivered, excl. tax. {rangeHint}.
          </p>
          {kpis.unpaidRevenue > 0 ? (
            <p className="text-warn mt-1 text-xs">
              + {money(kpis.unpaidRevenue)} delivered on orders not paid yet, counted once payment is verified.
            </p>
          ) : null}
        </Card>
      </div>
      <StatGrid
        cols={4}
        items={[
          { label: "Total costs", value: money(kpis.costs) },
          { label: "Net profit", value: money(kpis.profit), tone: kpis.profit < 0 ? "bad" : "ok" },
          { label: "Profit margin", value: pct(kpis.marginPct) },
          { label: "Avg profit / tiffin", value: kpis.profitPerTiffin == null ? "—" : money(kpis.profitPerTiffin) },
        ]}
      />
    </div>
  );
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
