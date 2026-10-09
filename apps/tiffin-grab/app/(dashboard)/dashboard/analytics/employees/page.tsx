import { Suspense } from "react";
import Link from "next/link";
import { SkeletonStatCards } from "@/components/ds";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { inquiriesHref } from "@/lib/analytics/drill";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart } from "@/components/analytics/charts";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@foundry/ui/table";
import { Skeleton } from "@foundry/ui/skeleton";
import { getEmployeeRollup, type EmployeeRow } from "@/lib/services/analytics/employees.service";
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
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">No data yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rep</TableHead>
          <TableHead className="text-right">Leads worked</TableHead>
          <TableHead className="text-right">Converted</TableHead>
          <TableHead className="text-right">Conversion rate</TableHead>
          <TableHead className="text-right">Tickets resolved</TableHead>
          <TableHead className="text-right">Avg. resolution</TableHead>
          <TableHead className="text-right">Rep-daily coupons</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r: EmployeeRow) => (
          <TableRow key={r.userId}>
            <TableCell className="font-medium">
              {r.publicId ? <Link href={inquiriesHref({ owner: r.publicId })} className="hover:underline">{r.name}</Link> : r.name}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.publicId ? (
                <Link href={inquiriesHref({ owner: r.publicId })} className="hover:underline">{r.leadsWorked}</Link>
              ) : (
                r.leadsWorked
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.publicId ? (
                <Link href={inquiriesHref({ owner: r.publicId, stage: "converted" })} className="hover:underline">
                  {r.leadsConverted}
                </Link>
              ) : (
                r.leadsConverted
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.conversionRatePct}%</TableCell>
            <TableCell className="text-right tabular-nums">
              <Link
                href={`/dashboard/tickets?status=resolved&owner=${encodeURIComponent(r.name)}`}
                className="hover:underline"
              >
                {r.ticketsResolved}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.avgResolutionHours != null ? `${r.avgResolutionHours}h` : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.repDailyCoupons}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
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
