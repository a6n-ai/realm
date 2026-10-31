/* eslint-disable react-hooks/purity */
import { Skeleton } from "@foundry/ui/skeleton";
import { cache, Suspense } from "react";
import { BanknoteIcon, TrendingUpIcon } from "lucide-react";
import { paymentsHref } from "@/lib/analytics/drill";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { DivergingBarChart, PartsDonut } from "@/components/analytics/charts";
import { AnalyticsStatCards, StatCardsSkeleton, StatFootnote, type AnalyticsStatCardItem } from "@/components/dashboard/stat-cards";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { Badge } from "@/components/reui/badge";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import {
  clockInZone,
  currentMonth,
  navScope,
  type Grain,
  type ProfitabilityKpis,
} from "@/lib/analytics/profitability";
import { LiveRefresh } from "@/components/analytics/live-refresh";
import { AssumptionChips } from "./assumption-chips";
import { DayCards } from "./day-cards";
import { GrainNav } from "./grain-nav";

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
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="Earned revenue minus variable and allocated costs under your assumptions."
        action={
          <Suspense fallback={<Skeleton className="h-10 w-full max-w-xl" />}>
            <Nav view={view} />
          </Suspense>
        }
      />

      <Suspense fallback={<Skeleton className="h-8 w-full max-w-3xl" />}>
        <Assumptions view={view} />
      </Suspense>

      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <Headline view={view} />
      </Suspense>

      <Suspense fallback={null}>
        <MigratedNote view={view} />
      </Suspense>

      <ChartCard
        title={CARDS_TITLE[grain]}
        subtitle="Revenue is allocated to the day the tiffin went out, not the day the customer paid. Open a card for its cost breakdown."
      >
        <Suspense fallback={<ChartSkeleton height={320} />}>
          <Cards view={view} />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard
          title={`Profit by ${PERIOD[grain]}`}
          subtitle="Earned revenue minus variable and allocated costs. Not cash collected. Green above zero, red below."
        >
          <Suspense fallback={<ChartSkeleton />}>
            <Trend view={view} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Where the money goes" subtitle="Total costs in this range by kind, under your assumptions.">
          <Suspense fallback={<ChartSkeleton />}>
            <Costs view={view} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

const PERIOD = { daily: "day", weekly: "week", monthly: "month" } as const;
const CARDS_TITLE = { daily: "Day by day", weekly: "Week by week", monthly: "Month by month" } as const;

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

  const items: AnalyticsStatCardItem[] = [
    {
      label: "Cash collected",
      value: money(kpis.cashCollected),
      hint: `Paid minus refunds, incl. tax, excl. card surcharge · ${DATE_BASIS_LABEL.money}. Equals Revenue net collected.`,
      href: cashHref,
      badge: "Settled",
      badgeTone: "neutral",
      footer: (
        <StatFootnote>
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <BanknoteIcon className="size-3.5" aria-hidden />
            Open settled payments
          </span>
        </StatFootnote>
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
          <StatFootnote>
            <span className="text-muted-foreground">Not paid yet</span>
            <span className="text-warning-foreground dark:text-warning font-semibold tabular-nums">{money(kpis.unpaidRevenue)}</span>
          </StatFootnote>
        ) : (
          <StatFootnote>
            <span className="text-muted-foreground">Allocated on delivery day</span>
            <Badge variant="success-light">Current</Badge>
          </StatFootnote>
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
        <StatFootnote>
          <span className="text-muted-foreground">Total costs</span>
          <span className="text-foreground font-semibold tabular-nums">{money(kpis.costs)}</span>
        </StatFootnote>
      ),
    },
    {
      label: "Avg profit / tiffin",
      value: kpis.profitPerTiffin == null ? "—" : money(kpis.profitPerTiffin),
      hint: "Earned revenue minus costs, per delivered tiffin.",
      tone: kpis.profitPerTiffin != null && kpis.profitPerTiffin < 0 ? "bad" : undefined,
      badge: "Per tiffin",
      badgeTone: "brand",
      footer: (
        <StatFootnote>
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <TrendingUpIcon className="size-3.5" aria-hidden />
            Under current assumptions
          </span>
        </StatFootnote>
      ),
    },
  ];

  return <AnalyticsStatCards items={items} />;
}

async function Trend({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <DivergingBarChart data={report.trend} xKey="period" tipKey="tip" yKey="profit" label="Profit" format="currency" />;
}

async function Cards({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <DayCards rows={report.rows} grain={report.grain} from={report.from} to={report.to} />;
}

async function Costs({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <PartsDonut format="currency" caption="Total costs" max={6} parts={report.costParts.map((c) => ({ ...c, tone: c.label === "Other" ? ("muted" as const) : undefined }))} />;
}

async function MigratedNote({ view }: { view: View }) {
  const { migratedTiffinsExcluded: n, migratedAddonPayments: addons } = await reportFrom(view);
  if (n === 0 && addons === 0) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {n > 0 ? `${n} ${n === 1 ? "tiffin" : "tiffins"} from orders migrated from the old site ${n === 1 ? "is" : "are"} not counted (paid on the old site, no price stored).` : null}
      {n > 0 && addons > 0 ? " " : null}
      {addons > 0 ? "Add-on payments on these orders are also not counted in earned revenue." : null}
    </p>
  );
}

async function Assumptions({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <AssumptionChips current={report.assumptions} />;
}
