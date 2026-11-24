import { round2 } from "@foundry/commons/util/money";
import { requirePagePermission } from "@/lib/auth/guards";
import { Can, NoAccessNote } from "@/components/auth/can";
import { Skeleton } from "@foundry/ui/skeleton";
import Link from "next/link";
import { cache, Suspense } from "react";
import { BanknoteIcon, TrendingUpIcon } from "lucide-react";
import { paymentsHref } from "@/lib/analytics/drill";
import { scopeOrAlert } from "@/components/dashboard/analytics/franchise-unavailable";
import { DATE_BASIS_LABEL } from "@/lib/analytics/metrics/scope";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";
import { PAID } from "@/lib/payments/status";
import { ChartCard } from "@/components/dashboard/analytics/chart-card";
import { ChartSkeleton } from "@/components/dashboard/analytics/skeletons";
import { DivergingBarChart, WaterfallChart } from "@/components/dashboard/analytics/charts";
import { buildProfitWaterfall } from "@/lib/analytics/waterfall";

import { AnalyticsStatCards, AnalyticsStatCardsSkeleton, StatFootnote, type AnalyticsStatCardItem } from "@/components/dashboard/stat-cards";
import { AnalyticsIntro } from "@/components/dashboard/analytics/analytics-intro";
import { Badge } from "@/components/reui/badge";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { getProfitabilityReport } from "@/lib/analytics/profitability.service";
import { navScope, type Grain, type ProfitabilityKpis } from "@/lib/analytics/profitability";
import { currentMonth, monthBounds } from "@/lib/dates/epoch-window";
import { getOrderCostReport } from "@/lib/analytics/order-weeks.service";
import { ManualRefresh } from "@/components/dashboard/analytics/manual-refresh";
import { AssumptionChips } from "./assumption-chips";
import { DayCards } from "./day-cards";
import { OrderWeeksTable } from "./order-weeks-table";
import { GrainNav } from "./grain-nav";
import { isoDateInZone } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";
import { getMoneyFormatter } from "@/lib/settings";

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
  await requirePagePermission({ analytics: ["read"] });
  const sp = await searchParams;
  const resolved = await scopeOrAlert("/dashboard/analytics/profitability", sp);
  if (!resolved.scope) return resolved.alert;
  const month = parseMonth(sp.month, currentMonth(resolved.scope.tz));
  const grain = parseGrain(sp.view);
  // GrainNav writes ?view=&month= with no from/to; an explicit date filter wins over it.
  const scope = navScope(resolved.scope, sp.from != null || sp.to != null || sp.range != null, month, grain);
  const view = { month, grain, scope };
  return (
    <Can perms={{ finance: ["read"] }} fallback={<NoAccessNote />}>
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

        <Suspense fallback={<AnalyticsStatCardsSkeleton rows={1} />}>
          <Headline view={view} />
        </Suspense>

        <Suspense fallback={null}>
          <MigratedNote view={view} />
        </Suspense>

        <Suspense fallback={null}>
          <UnratedNote view={view} />
        </Suspense>

        <ChartCard
          title={CARDS_TITLE[grain]}
          subtitle="Each day: revenue, costs and profit" info="Revenue is allocated to the day the tiffin went out, not the day the customer paid. Open a day for each order's price / tiffin, food, driver and contribution. Monthly marketing and salaries stay on the day total. Each column is shaded on its own scale; weekends and days without deliveries are muted."
        >
          <Suspense fallback={<ChartSkeleton height={320} />}>
            <Cards view={view} />
          </Suspense>
        </ChartCard>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
          <ChartCard
            title={`Profit by ${PERIOD[grain]}`}
            subtitle="Earned revenue minus costs, not cash" info="Earned revenue minus variable and allocated costs. Not cash collected. Green above zero, red below."
          >
            <Suspense fallback={<ChartSkeleton />}>
              <Trend view={view} />
            </Suspense>
          </ChartCard>
          <ChartCard title="Where the money goes" subtitle="Cash, deductions, coupons, revenue, then each cost down to profit" info="Cash collected in this range, less deductions (tax, and money paid for tiffins not delivered in this range) and coupon discounts, gives revenue. Then food, driver, marketing, salaries and other costs come off, ending at the profit shown above.">
            <Suspense fallback={<ChartSkeleton />}>
              <Costs view={view} />
            </Suspense>
          </ChartCard>
        </div>

        <ChartCard
          title="Orders by week"
          subtitle="Each order's revenue, food and driver cost. Pick a delivery week."
          info="Revenue is the order's earned share per delivered tiffin, the same as above. Food comes from Catalog → Cost rates; driver from the per-tiffin assumption. Marketing and salaries stay in the page totals, not on orders. Losing orders are listed first."
        >
          <Suspense fallback={<ChartSkeleton height={320} />}>
            <OrderWeeks view={view} />
          </Suspense>
        </ChartCard>
      </div>
    </Can>
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

const loadOrderCosts = cache((scope: AnalyticsScope, from: string, to: string) => getOrderCostReport(scope, from, to));

function orderCostRange(view: View, from: string, to: string) {
  // A 12-month range would be ~52 tables; the monthly view lists the selected month only.
  return view.grain === "monthly" ? monthBounds(view.month) : { from, to };
}

async function Nav({ view }: { view: View }) {
  const report = await reportFrom(view);
  return (
    <GrainNav
      view={report.grain}
      month={report.month}
      aside={<ManualRefresh />}
    />
  );
}

async function Headline({ view }: { view: View }) {
  const [report, money] = await Promise.all([reportFrom(view), getMoneyFormatter()]);
  return (
    <HeadlineCards
      money={money}
      kpis={report.kpis}
      range={`${report.from} to ${report.to}`}
      toDate={report.to > isoDateInZone(requestNow(), view.scope.tz)}
      cashHref={paymentsHref(view.scope, { statuses: PAID, basis: "money" })}
    />
  );
}

function HeadlineCards({ kpis, range, cashHref, toDate, money }: { kpis: ProfitabilityKpis; range: string; cashHref: string; toDate: boolean; money: (n: number) => string }) {
  const rangeHint = toDate ? `${range}, to date` : range;

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
      hint: `Value of paid tiffins delivered, excl. tax, after coupons${kpis.coupons > 0 ? ` (${money(round2(kpis.revenue + kpis.coupons))} before)` : ""}. ${rangeHint}.`,
      badge: "Delivered",
      badgeTone: "ok",
      footer: (
        <div className="flex flex-col gap-1">
          {kpis.coupons > 0 ? (
            <StatFootnote>
              <span className="text-muted-foreground">Coupon deductions</span>
              <span className="text-foreground font-semibold tabular-nums">−{money(kpis.coupons)}</span>
            </StatFootnote>
          ) : null}
          {kpis.unpaidRevenue > 0 ? (
            <StatFootnote>
              <span className="text-muted-foreground">Not paid yet</span>
              <span className="text-warning-foreground dark:text-warning font-semibold tabular-nums">{money(kpis.unpaidRevenue)}</span>
            </StatFootnote>
          ) : (
            <StatFootnote>
              <span className="text-muted-foreground">Allocated on delivery day</span>
              <Badge variant="success-light">Current</Badge>
            </StatFootnote>
          )}
        </div>
      ),
    },
    {
      label: "Profit margin",
      value: pct(kpis.marginPct),
      hint: `Net profit ${money(kpis.profit)} after assumed costs${toDate ? ", to date" : ""}.`,
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
      hint: `Earned revenue minus costs, per delivered tiffin${toDate ? ", to date" : ""}.`,
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

async function OrderWeeks({ view }: { view: View }) {
  const report = await reportFrom(view);
  const range = orderCostRange(view, report.from, report.to);
  const { weeks } = await loadOrderCosts(view.scope, range.from, range.to);
  return <OrderWeeksTable weeks={weeks} />;
}

async function Trend({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <DivergingBarChart data={report.trend} xKey="period" tipKey="tip" yKey="profit" label="Profit" format="currency" />;
}

async function Cards({ view }: { view: View }) {
  const report = await reportFrom(view);
  const range = orderCostRange(view, report.from, report.to);
  const { byDay } = report.grain === "daily" ? await loadOrderCosts(view.scope, range.from, range.to) : { byDay: {} };
  return <DayCards rows={report.rows} grain={report.grain} from={report.from} to={report.to} ordersByDay={byDay} />;
}

async function Costs({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <WaterfallChart format="currency" {...buildProfitWaterfall(report.kpis, report.costParts, report.free)} />;
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

async function UnratedNote({ view }: { view: View }) {
  const { tiffinsWithoutRate: n, unratedCategories } = await reportFrom(view);
  if (n <= 0) return null;
  const shown = Math.max(1, Math.round(n));
  return (
    <Alert variant="info">
      <AlertDescription>
        {`${shown} ${shown === 1 ? "tiffin has" : "tiffins have"} items without a cost rate${unratedCategories.length ? ` (${unratedCategories.join(", ")})` : ""}. `}
        <Link href="/dashboard/catalog/cost-rates" prefetch={false} className="underline underline-offset-4">
          Set cost rates
        </Link>
      </AlertDescription>
    </Alert>
  );
}

async function Assumptions({ view }: { view: View }) {
  const report = await reportFrom(view);
  return <AssumptionChips current={report.assumptions} />;
}
