import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart } from "@/components/analytics/charts";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@foundry/ui/table";
import { Skeleton } from "@foundry/ui/skeleton";
import { getEmployeeRollup, type EmployeeRow } from "@/lib/services/analytics/employees.service";

export default function EmployeesAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={3} />}>
        <StatsData />
      </Suspense>

      <ChartCard title="Leads worked per rep">
        <Suspense fallback={<ChartSkeleton />}>
          <LeadsChart />
        </Suspense>
      </ChartCard>

      <ChartCard title="Per-rep breakdown">
        <Suspense fallback={<TableRowsSkeleton />}>
          <RollupTable />
        </Suspense>
      </ChartCard>
    </div>
  );
}

async function StatsData() {
  const rows = await getEmployeeRollup();
  const activeReps = rows.length;
  const totalLeadsWorked = rows.reduce((s, r) => s + r.leadsWorked, 0);
  const totalTicketsResolved = rows.reduce((s, r) => s + r.ticketsResolved, 0);
  return (
    <StatGrid
      cols={3}
      items={[
        { label: "Active reps", value: activeReps },
        { label: "Total leads worked", value: totalLeadsWorked },
        { label: "Total tickets resolved", value: totalTicketsResolved },
      ]}
    />
  );
}

async function LeadsChart() {
  const rows = await getEmployeeRollup();
  const data = rows.map((r) => ({ name: r.name, n: r.leadsWorked }));
  return <BreakdownBarChart data={data} xKey="name" yKey="n" />;
}

async function RollupTable() {
  const rows = await getEmployeeRollup();
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
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell className="text-right tabular-nums">{r.leadsWorked}</TableCell>
            <TableCell className="text-right tabular-nums">{r.leadsConverted}</TableCell>
            <TableCell className="text-right tabular-nums">{r.conversionRatePct}%</TableCell>
            <TableCell className="text-right tabular-nums">{r.ticketsResolved}</TableCell>
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
