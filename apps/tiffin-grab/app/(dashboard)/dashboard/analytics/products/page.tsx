import { getSession } from "@/lib/auth/session";
import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { BreakdownBarChart } from "@/components/analytics/charts";
import { ordersHref } from "@/lib/analytics/drill";
import {
  getProductStats,
  getTopDishes,
  getOrdersByPlan,
  getOrdersByTier,
  getOrdersByMealType,
} from "@/lib/services/analytics/products.service";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

type SearchParams = Promise<AnalyticsSearchParams>;

export default function ProductsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Products & Menu"
        title="Products & Menu"
        description="What people pick, and how paid orders split across plans, sizes, and meal types."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-7 w-28 animate-pulse rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<SkeletonStatCards count={3} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Most-picked dishes" subtitle="Meal selections in this range.">
          <Suspense fallback={<ChartSkeleton />}>
            <TopDishesChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Paid by meal size" subtitle="Budget, medium, and premium. Custom sizes are not included.">
          <Suspense fallback={<ChartSkeleton />}>
            <TierBarChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Paid orders by plan" subtitle="Money received on settled payments. Open a plan to see those orders.">
          <Suspense fallback={<ChartSkeleton />}>
            <PlanChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Paid orders by meal type"
          subtitle="Maharaja Thali, 4 Item Thali, and other catalog sizes. Custom sizes are not included."
        >
          <Suspense fallback={<ChartSkeleton />}>
            <MealTypeList searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const s = await getProductStats(await parseAnalyticsFilters(await searchParams, await getSession()));
  return (
    <MetricTiles
      cols={3}
      items={[
        { label: "Meal selections", value: s.totalSelections, badge: "Picks", badgeTone: "neutral" },
        { label: "Distinct dishes ordered", value: s.distinctDishes, badge: "Dishes", badgeTone: "brand" },
        {
          label: "Most popular dish",
          value: s.topDish ?? "—",
          valueSize: "label",
          badge: "Top",
          badgeTone: "ok",
        },
      ]}
    />
  );
}

async function TopDishesChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getTopDishes(8, await parseAnalyticsFilters(await searchParams, await getSession()));
  return <BreakdownBarChart data={rows} xKey="dish" yKey="n" height={280} />;
}

async function TierBarChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getOrdersByTier(await parseAnalyticsFilters(await searchParams, await getSession()));
  return (
    <BreakdownBarChart
      data={rows.map((r) => ({ tier: r.tier, paid: r.paid }))}
      xKey="tier"
      yKey="paid"
      format="currency"
      height={280}
    />
  );
}

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

async function PlanChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getOrdersByPlan(await parseAnalyticsFilters(await searchParams, await getSession()));
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

async function MealTypeList({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getOrdersByMealType(await parseAnalyticsFilters(await searchParams, await getSession()));
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.mealType,
        n: r.paid,
        aside: money(r.paid),
        meta: `${r.plan} · ${r.orders} ${r.orders === 1 ? "order" : "orders"}`,
      }))}
      emptyLabel="No paid orders yet."
    />
  );
}

