import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, DistributionDonutChart } from "@/components/analytics/charts";
import {
  getProductStats,
  getTopDishes,
  getOrdersByPlan,
  getOrdersByTier,
} from "@/lib/services/analytics/products.service";

export default function ProductsAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={3} />}>
        <StatsData />
      </Suspense>

      <ChartCard title="Most-picked dishes">
        <Suspense fallback={<ChartSkeleton />}>
          <TopDishesChart />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Orders by plan">
          <Suspense fallback={<ChartSkeleton />}>
            <PlanChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Orders by meal-size tier">
          <Suspense fallback={<ChartSkeleton />}>
            <TierChart />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData() {
  const s = await getProductStats();
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

async function TopDishesChart() {
  const rows = await getTopDishes();
  return <BreakdownBarChart data={rows} xKey="dish" yKey="n" height={280} />;
}

async function PlanChart() {
  const rows = await getOrdersByPlan();
  return <DistributionDonutChart data={rows} nameKey="plan" valueKey="n" />;
}

async function TierChart() {
  const rows = await getOrdersByTier();
  return <DistributionDonutChart data={rows} nameKey="tier" valueKey="n" />;
}
