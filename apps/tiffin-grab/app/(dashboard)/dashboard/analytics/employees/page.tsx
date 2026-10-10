import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { inquiriesHref } from "@/lib/analytics/drill";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart } from "@/components/analytics/charts";
import { Skeleton } from "@foundry/ui/skeleton";
import { getEmployeeRollup } from "@/lib/services/analytics/employees.service";
import { EmployeeRollupTable } from "./rollup-table";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

type SearchParams = Promise<AnalyticsSearchParams>;

export default function EmployeesAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={3} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <ChartCard title="Leads worked per rep">
        <Suspense fallback={<ChartSkeleton />}>
          <LeadsChart searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <ChartCard title="Per-rep breakdown">
        <Suspense fallback={<TableRowsSkeleton />}>
          <RollupTable searchParams={searchParams} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getEmployeeRollup(parseAnalyticsFilters(await searchParams));
  const activeReps = rows.length;
  const totalLeadsWorked = rows.reduce((s, r) => s + r.leadsWorked, 0);
  const totalTicketsResolved = rows.reduce((s, r) => s + r.ticketsResolved, 0);
  return (
    <MetricTiles
      cols={3}
      items={[
        { label: "Active reps", value: activeReps },
        { label: "Total leads worked", value: totalLeadsWorked, href: inquiriesHref() },
        { label: "Total tickets resolved", value: totalTicketsResolved, href: "/dashboard/tickets?status=resolved" },
      ]}
    />
  );
}

async function LeadsChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getEmployeeRollup(parseAnalyticsFilters(await searchParams));
  const data = rows.map((r) => ({ name: r.name, n: r.leadsWorked }));
  return <BreakdownBarChart data={data} xKey="name" yKey="n" />;
}

async function RollupTable({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getEmployeeRollup(parseAnalyticsFilters(await searchParams));
  return <EmployeeRollupTable rows={rows} />;
}

function TableRowsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
