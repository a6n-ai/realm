import { cache, Suspense } from "react";
import { BanknoteIcon, TrendingUpIcon } from "lucide-react";
import { Card, SkeletonStatCards, StatGrid } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { TrendLineChart } from "@/components/analytics/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { cn } from "@foundry/ui/cn";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import {
  currentMonth,
  periodLabel,
  type Grain,
  type ProfitabilityKpis,
  type ProfitRow,
} from "@/lib/analytics/profitability";
import { AssumptionsForm } from "./assumptions-form";
import { GrainNav } from "./grain-nav";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

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

type SearchParams = Promise<{ view?: string; month?: string }>;

export default function ProfitabilityAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="bg-muted/40 h-10 animate-pulse rounded-lg" />}>
        <Nav searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <Headline searchParams={searchParams} />
      </Suspense>

      <ChartCard
        title="Profit trend"
        subtitle="Earned revenue minus variable and allocated costs. Not cash collected."
      >
        <Suspense fallback={<ChartSkeleton />}>
          <Trend searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <ChartCard title="By period" subtitle="Revenue is allocated to the day the tiffin went out, not the day the customer paid.">
        <Suspense fallback={<ChartSkeleton height={320} />}>
          <Grid searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <Suspense fallback={<ChartSkeleton height={180} />}>
        <Assumptions searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const loadReport = cache((month: string, grain: Grain) => getProfitabilityReport({ month, grain }));

async function reportFrom(searchParams: SearchParams) {
  const sp = await searchParams;
  const { timezone } = await getAppSettings();
  const month = parseMonth(sp.month, currentMonth(timezone));
  const grain = parseGrain(sp.view);
  return loadReport(month, grain);
}

async function Nav({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <GrainNav view={report.grain} month={report.month} />;
}

async function Headline({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <HeadlineCards kpis={report.kpis} grain={report.grain} />;
}

function HeadlineCards({ kpis, grain }: { kpis: ProfitabilityKpis; grain: Grain }) {
  const rangeHint =
    grain === "monthly" ? "Last 12 months" : grain === "weekly" ? "Weeks in this month" : "This month";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <BanknoteIcon className="size-3.5" />
            Cash collected
          </p>
          <p className="nums mt-1 text-2xl font-semibold tabular-nums">{money(kpis.cashCollected)}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">What customers actually paid. {rangeHint}.</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <TrendingUpIcon className="size-3.5" />
            Revenue earned
          </p>
          <p className="nums mt-1 text-2xl font-semibold tabular-nums">{money(kpis.revenue)}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">Value of tiffins delivered. {rangeHint}.</p>
        </Card>
      </div>
      <StatGrid
        cols={4}
        items={[
          { label: "Total costs", value: money(kpis.costs) },
          { label: "Net profit", value: money(kpis.profit), tone: kpis.profit < 0 ? "bad" : "ok" },
          { label: "Profit margin", value: pct(kpis.marginPct) },
          { label: "Avg profit / tiffin", value: kpis.profitPerTiffin == null ? "—" : money(kpis.profitPerTiffin) },
        ]}
      />
    </div>
  );
}

async function Trend({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <TrendLineChart data={report.trend} xKey="period" yKey="profit" />;
}

async function Grid({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <ProfitTable rows={report.rows} grain={report.grain} />;
}

async function Assumptions({ searchParams }: { searchParams: SearchParams }) {
  const report = await reportFrom(searchParams);
  return <AssumptionsForm current={report.assumptions} />;
}

const COLUMNS = [
  { key: "date", label: "Date", align: "left" },
  { key: "tiffins", label: "Tiffins delivered", align: "right" },
  { key: "cash", label: "Cash collected", align: "right" },
  { key: "revenue", label: "Revenue earned", align: "right" },
  { key: "kitchen", label: "Kitchen", align: "right" },
  { key: "driver", label: "Driver", align: "right" },
  { key: "marketing", label: "Marketing", align: "right" },
  { key: "salaries", label: "Salaries", align: "right" },
  { key: "other", label: "Other", align: "right" },
  { key: "profit", label: "Profit", align: "right" },
  { key: "margin", label: "Margin", align: "right" },
] as const;

function ProfitTable({ rows, grain }: { rows: ProfitRow[]; grain: Grain }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No days in this range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.date}>
              <TableCell className="whitespace-nowrap">{periodLabel(r.date, grain)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.tiffins}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.cashCollected)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.revenue)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.kitchen)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.driver)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.marketing)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.salaries)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.other)}</TableCell>
              <TableCell
                className={cn(
                  "text-right font-medium tabular-nums",
                  r.profit < 0 && "text-destructive",
                )}
              >
                {money(r.profit)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.marginPct)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
