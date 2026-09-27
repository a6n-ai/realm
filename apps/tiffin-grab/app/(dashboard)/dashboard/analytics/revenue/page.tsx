/* eslint-disable react-hooks/purity */
import { cache, Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton, ListSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, TrendLineChart } from "@/components/analytics/charts";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { LiveRefresh } from "@/components/analytics/live-refresh";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  REVENUE_METHODS,
  getRevenueReport,
  parseRevenueFilters,
  type RevenueSummary,
} from "@/lib/services/analytics/revenue.service";
import { clockInZone } from "@/lib/analytics/profitability";
import { methodLabel, type DiscountLine, type DiscountSource } from "@/lib/analytics/revenue";
import { RevenueFilters } from "./filters";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const RANGE_LABEL = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function rangeLabel(from: string, to: string) {
  const a = RANGE_LABEL.format(new Date(`${from}T00:00:00Z`));
  const b = RANGE_LABEL.format(new Date(`${to}T00:00:00Z`));
  return a === b ? a : `${a} – ${b}`;
}

type SearchParams = Promise<{ from?: string; to?: string; method?: string }>;

const METHOD_OPTIONS = REVENUE_METHODS.map((m) => ({ value: m, label: methodLabel(m) }));

const loadReport = cache((from: string, to: string, method: string) =>
  getRevenueReport(parseRevenueFilters({ from, to, method })),
);

async function reportFrom(searchParams: SearchParams): Promise<RevenueSummary> {
  const sp = await searchParams;
  return loadReport(sp.from ?? "", sp.to ?? "", sp.method ?? "");
}

export default function RevenueAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="bg-muted/40 h-8 w-full max-w-xl animate-pulse rounded-lg" />}>
        <RangeAndLive searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<SkeletonStatCards count={8} />}>
        <Kpis searchParams={searchParams} />
      </Suspense>

      <ChartCard
        title="Revenue over time"
        subtitle="Net sales exclude tax. Net collected is settled payments after refunds."
      >
        <Suspense fallback={<ChartSkeleton />}>
          <Trend searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By payment method" subtitle="Settled payments, including tax.">
          <Suspense fallback={<ChartSkeleton />}>
            <MethodChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Discounts given" subtitle="Across settled orders in this range.">
          <Suspense fallback={<ListSkeleton />}>
            <Discounts searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function RangeAndLive({ searchParams }: { searchParams: SearchParams }) {
  const [report, { timezone }] = await Promise.all([reportFrom(searchParams), getAppSettings()]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <RevenueFilters from={report.from} to={report.to} methods={METHOD_OPTIONS} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-xs">{rangeLabel(report.from, report.to)}</span>
        <LiveRefresh updatedLabel={clockInZone(Date.now(), timezone)} />
      </div>
    </div>
  );
}

async function Kpis({ searchParams }: { searchParams: SearchParams }) {
  const { kpis: k } = await reportFrom(searchParams);
  return (
    <div className="space-y-3">
      <MetricTiles
        cols={4}
        items={[
          { label: "Gross sales", value: money(k.grossSales), hint: "List price before discounts, excl. tax" },
          {
            label: "Discounts",
            value: money(k.discounts),
            hint: k.discountRatePct == null ? "No sales in range" : `${k.discountRatePct}% of gross sales`,
          },
          { label: "Net sales", value: money(k.netSales), hint: "Gross sales minus discounts, excl. tax" },
          { label: "Tax collected", value: money(k.tax), hint: "Owed to the government, not revenue" },
        ]}
      />
      <MetricTiles
        cols={4}
        items={[
          {
            label: "Net collected",
            value: money(k.netCollected),
            hint: k.refunded > 0 ? `${money(k.collected)} received − ${money(k.refunded)} refunded` : "Net sales plus tax",
          },
          {
            label: "Refunded",
            value: money(k.refunded),
            tone: k.refunded > 0 ? "warn" : "default",
            hint: "By original payment date",
          },
          {
            label: "Awaiting payment",
            value: money(k.pendingAmount),
            tone: k.pendingCount > 0 ? "warn" : "default",
            hint: `${k.pendingCount} ${k.pendingCount === 1 ? "payment" : "payments"} not yet verified`,
            href: k.pendingCount > 0 ? "/dashboard/payments/requests" : undefined,
          },
          {
            label: "Avg order value",
            value: k.avgOrderValue == null ? "—" : money(k.avgOrderValue),
            hint: `${k.orders} settled ${k.orders === 1 ? "order" : "orders"}, excl. tax`,
          },
        ]}
      />
    </div>
  );
}

async function Trend({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return (
    <TrendLineChart
      data={report.trend}
      xKey="period"
      format="currency"
      series={[
        { key: "netSales", label: "Net sales" },
        { key: "collected", label: "Net collected" },
      ]}
    />
  );
}

async function MethodChart({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <BreakdownBarChart data={report.byMethod} xKey="method" yKey="amount" format="currency" />;
}

const SOURCE_LABEL: Record<DiscountSource, string> = {
  catalog: "Plan discount",
  coupon: "Coupon",
  coins: "Wallet",
  other: "Discount",
};

async function Discounts({ searchParams }: { searchParams: SearchParams }) {
  const { discounts, kpis } = await reportFrom(searchParams);
  if (discounts.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No discounts in this range.</p>;
  }
  const max = Math.max(...discounts.map((d) => d.amount), 1);
  return (
    <ul className="divide-border/60 -my-1 divide-y">
      {discounts.map((d: DiscountLine) => (
        <li key={`${d.source}:${d.label}`} className="py-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm">
              {d.label}
              <span className="text-muted-foreground"> · {SOURCE_LABEL[d.source]}</span>
            </span>
            <span className="text-sm tabular-nums">
              <span className="font-semibold">{money(d.amount)}</span>
              <span className="text-muted-foreground">
                {" "}
                · {d.orders} {d.orders === 1 ? "order" : "orders"}
              </span>
            </span>
          </div>
          <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${Math.round((d.amount / max) * 100)}%` }} />
          </div>
        </li>
      ))}
      <li className="flex items-baseline justify-between pt-2 text-sm">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular-nums">{money(kpis.discounts)}</span>
      </li>
    </ul>
  );
}
