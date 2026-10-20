import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { BreakdownBarChart } from "@/components/analytics/charts";
import { ordersHref } from "@/lib/analytics/drill";
import {
  getProductStats,
  getTopDishes,
  getOrdersByPlan,
  getOrdersByTier,
} from "@/lib/services/analytics/products.service";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

type SearchParams = Promise<AnalyticsSearchParams>;

export default function ProductsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={3} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <ChartCard title="Most-picked dishes">
        <Suspense fallback={<ChartSkeleton />}>
          <TopDishesChart searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Paid orders by plan" subtitle="Money received on settled payments. Open a plan to see those orders.">
          <Suspense fallback={<ChartSkeleton />}>
            <PlanChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Paid orders by meal size" subtitle="Budget, medium, and premium. Custom sizes are not included.">
          <Suspense fallback={<ChartSkeleton />}>
            <TierChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const s = await getProductStats(await parseAnalyticsFilters(await searchParams));
  return (
    <StatGrid
      cols={3}
      items={[
        { label: "Meal selections", value: s.totalSelections },
        { label: "Distinct dishes ordered", value: s.distinctDishes },
        { label: "Most popular dish", value: s.topDish ?? "—" },
      ]}
    />
  );
}

async function TopDishesChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getTopDishes(8, await parseAnalyticsFilters(await searchParams));
  return <BreakdownBarChart data={rows} xKey="dish" yKey="n" height={280} />;
}

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

async function PlanChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getOrdersByPlan(await parseAnalyticsFilters(await searchParams));
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.plan,
        n: r.paid,
        aside: money(r.paid),
        meta: `${r.orders} ${r.orders === 1 ? "order" : "orders"}`,
        href: ordersHref({ plan: r.key }),
      }))}
      emptyLabel="No paid orders yet."
    />
  );
}

async function TierChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getOrdersByTier(await parseAnalyticsFilters(await searchParams));
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.tier,
        n: r.paid,
        aside: money(r.paid),
        meta: `${r.orders} ${r.orders === 1 ? "order" : "orders"}`,
        href: ordersHref({ tier: r.key }),
      }))}
      emptyLabel="No paid orders yet."
    />
  );
}
