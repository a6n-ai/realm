/* eslint-disable react-hooks/purity */
import { cache, Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton, ListSkeleton } from "@/components/analytics/skeletons";
import { TrendLineChart } from "@/components/analytics/charts";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { LiveRefresh } from "@/components/analytics/live-refresh";
import { paymentsHref, zonedRangeMs } from "@/lib/analytics/drill";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  getRevenueReport,
  parseRevenueFilters,
  type RevenueReport,
} from "@/lib/services/analytics/revenue.service";
import { clockInZone } from "@/lib/analytics/profitability";
import { SETTLED_STATUSES, type DiscountLine, type DiscountSource } from "@/lib/analytics/revenue";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const RANGE_LABEL = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function rangeLabel(from: string, to: string) {
  const a = RANGE_LABEL.format(new Date(`${from}T00:00:00Z`));
  const b = RANGE_LABEL.format(new Date(`${to}T00:00:00Z`));
  return a === b ? a : `${a} – ${b}`;
}

type SearchParams = Promise<{
  from?: string;
  to?: string;
  method?: string;
  plan?: string;
  mealSize?: string;
  zone?: string;
}>;

const loadReport = cache(
  (from: string, to: string, method: string, plan: string, mealSize: string, zone: string) =>
    getRevenueReport(parseRevenueFilters({ from, to, method, plan, mealSize, zone })),
);

async function reportFrom(searchParams: SearchParams): Promise<RevenueReport> {
  const sp = await searchParams;
  return loadReport(
    sp.from ?? "",
    sp.to ?? "",
    sp.method ?? "",
    sp.plan ?? "",
    sp.mealSize ?? "",
    sp.zone ?? "",
  );
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

      <ChartCard
        title="Payments by status"
        subtitle="Created in this range. Open a row to see those payments. The totals above follow the day the money moved."
      >
        <Suspense fallback={<ListSkeleton />}>
          <Statuses searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By payment method" subtitle="Settled payments, including tax.">
          <Suspense fallback={<ListSkeleton />}>
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
    <div className="flex flex-wrap items-center justify-end gap-3">
      <span className="text-muted-foreground text-xs">{rangeLabel(report.from, report.to)}</span>
      <LiveRefresh updatedLabel={clockInZone(Date.now(), timezone)} />
    </div>
  );
}

async function rangeFor(searchParams: SearchParams) {
  const sp = await searchParams;
  const [report, { timezone }] = await Promise.all([reportFrom(searchParams), getAppSettings()]);
  const filters = parseRevenueFilters(sp);
  const range = zonedRangeMs(report.from, report.to, timezone);
  const settled = (extra: { statuses?: readonly string[] } = {}) =>
    paymentsHref({
      statuses: extra.statuses ?? SETTLED_STATUSES,
      methods: filters.methods,
      fromMs: range.from,
      toMs: range.to,
    });
  return { report, filters, range, settled };
}

async function Kpis({ searchParams }: { searchParams: SearchParams }) {
  const { report, settled } = await rangeFor(searchParams);
  const k = report.kpis;
  const paid = settled();
  return (
    <div className="space-y-3">
      <MetricTiles
        cols={4}
        items={[
          { label: "Gross sales", value: money(k.grossSales), hint: "List price before discounts, excl. tax", href: paid },
          {
            label: "Discounts",
            value: money(k.discounts),
            hint: k.discountRatePct == null ? "No sales in range" : `${k.discountRatePct}% of gross sales`,
            href: paid,
          },
          { label: "Net sales", value: money(k.netSales), hint: "Gross sales minus discounts, excl. tax", href: paid },
          { label: "Tax collected", value: money(k.tax), hint: "Owed to the government, not revenue", href: paid },
        ]}
      />
      <MetricTiles
        cols={4}
        items={[
          {
            label: "Net collected",
            value: money(k.netCollected),
            hint: k.refunded > 0 ? `${money(k.collected)} received − ${money(k.refunded)} refunded` : "Paid amounts, including tax",
            href: paid,
          },
          {
            label: "Refunded",
            value: money(k.refunded),
            tone: k.refunded > 0 ? "warn" : "default",
            hint: "By original payment date",
            href: settled({ statuses: ["refunded"] }),
          },
          {
            label: "Awaiting payment",
            value: money(k.pendingAmount),
            tone: k.pendingCount > 0 ? "warn" : "default",
            hint: `${k.pendingCount} ${k.pendingCount === 1 ? "payment" : "payments"} not yet verified`,
            href: settled({ statuses: ["awaiting_payment", "pending_verification"] }),
          },
          {
            label: "Avg order value",
            value: k.avgOrderValue == null ? "—" : money(k.avgOrderValue),
            hint: `${k.orders} settled ${k.orders === 1 ? "order" : "orders"}, excl. tax`,
            href: paid,
          },
        ]}
      />
    </div>
  );
}

async function Statuses({ searchParams }: { searchParams: SearchParams }) {
  const { report, filters, range } = await rangeFor(searchParams);
  return (
    <BreakdownList
      rows={report.byStatus.map((s) => ({
        label: s.label,
        n: s.count,
        aside: money(s.amount),
        meta: `${s.count} ${s.count === 1 ? "payment" : "payments"}`,
        href: paymentsHref({
          statuses: [s.status],
          methods: filters.methods,
          fromMs: range.from,
          toMs: range.to,
        }),
      }))}
      emptyLabel="No payments created in this range."
    />
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
  const { report, range } = await rangeFor(searchParams);
  return (
    <BreakdownList
      rows={report.byMethod.map((m) => ({
        label: m.method,
        n: m.amount,
        aside: money(m.amount),
        href: paymentsHref({
          statuses: SETTLED_STATUSES,
          methods: [m.key],
          fromMs: range.from,
          toMs: range.to,
        }),
      }))}
      emptyLabel="No settled payments in this range."
    />
  );
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
