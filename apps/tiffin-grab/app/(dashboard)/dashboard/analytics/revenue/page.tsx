import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton, ListSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, TrendLineChart } from "@/components/analytics/charts";
import {
  getRevenueStats,
  getRevenueTrend,
  getRevenueByMethod,
  getDiscountByKind,
} from "@/lib/services/analytics/revenue.service";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

export default function RevenueAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData />
      </Suspense>

      <ChartCard title="Revenue over time" subtitle="Captured payments, by day">
        <Suspense fallback={<ChartSkeleton />}>
          <TrendChart />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By payment method">
          <Suspense fallback={<ChartSkeleton />}>
            <MethodChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Discount cost by kind">
          <Suspense fallback={<ListSkeleton />}>
            <DiscountTable />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData() {
  const s = await getRevenueStats();
  return (
    <StatGrid
      cols={4}
      items={[
        { label: "Total revenue", value: money(s.totalRevenue) },
        { label: "Refunded", value: money(s.refunded) },
        { label: "Net revenue", value: money(s.net) },
        { label: "Discount cost", value: money(s.discountCost) },
      ]}
    />
  );
}

async function TrendChart() {
  const rows = await getRevenueTrend();
  return <TrendLineChart data={rows} xKey="day" yKey="amount" />;
}

async function MethodChart() {
  const rows = await getRevenueByMethod();
  return <BreakdownBarChart data={rows} xKey="method" yKey="amount" />;
}

async function DiscountTable() {
  const rows = await getDiscountByKind();
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">No data yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.kind} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground capitalize">{r.kind.replace(/_/g, " ")}</span>
          <span className="tabular-nums">
            <span className="font-medium">{money(r.amount)}</span>
            <span className="text-muted-foreground"> ({r.redemptions})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
