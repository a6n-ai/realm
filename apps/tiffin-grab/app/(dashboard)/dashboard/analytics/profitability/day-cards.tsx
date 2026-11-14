"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { DayCard, DayGridView } from "@/components/dashboard/analytics/day-card";
import { useFormatMoney } from "@/components/app-currency";
import { weekLabel } from "@/components/dashboard/analytics/daily-scorecard";
import { groupProfitWeeks } from "@/lib/analytics/profit-weeks";
import { ChartEmpty } from "@/components/dashboard/analytics/chart-boundary";
import { profitCalendar } from "@/lib/analytics/profit-calendar";
import { periodLabel, type Grain, type ProfitRow } from "@/lib/analytics/profitability";

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

function Card({ row, title }: { row: ProfitRow; title: string }) {
  const fmt = useFormatMoney();
  return (
    <DayCard
      title={title}
      sub={`${row.tiffins} ${row.tiffins === 1 ? "tiffin" : "tiffins"}`}
      stats={[
        ["Earned", fmt(row.revenue)],
        ["Cost", fmt(row.costs)],
      ]}
      profit={row.profit}
      details={[
        ["Kitchen", fmt(row.kitchen)],
        ["Driver", fmt(row.driver)],
        ["Marketing", fmt(row.marketing)],
        ["Salaries", fmt(row.salaries)],
        ["Other", fmt(row.other)],
        ["Cash collected", fmt(row.cashCollected)],
        ["Margin", pct(row.marginPct)],
      ]}
    />
  );
}

/** Daily: a Mon–Fri calendar of days that had deliveries, with a By week tab. Weekly and monthly: one card per period. */
export function DayCards({ rows, grain, from, to }: { rows: ProfitRow[]; grain: Grain; from: string; to: string }) {
  if (grain !== "daily") {
    if (rows.length === 0) return <ChartEmpty message="No periods in this range." />;
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <Card key={r.date} row={r} title={periodLabel(r.date, grain)} />
        ))}
      </div>
    );
  }
  const { columns, weeks } = profitCalendar(rows, from, to);
  if (weeks.length === 0) return <ChartEmpty message="No deliveries in this range." />;
  const byWeek = groupProfitWeeks(rows.filter((r) => r.tiffins > 0));
  return (
    <Tabs defaultValue="day" className="flex flex-col gap-3">
      <TabsList>
        <TabsTrigger value="day">By day</TabsTrigger>
        <TabsTrigger value="week">By week</TabsTrigger>
      </TabsList>
      <TabsContent value="day" className="flex flex-col gap-3">
        <DayGridView
          columns={columns}
          weeks={weeks.map((w) => w.map((r) => (r ? <div key={r.date}><Card row={r} title={periodLabel(r.date, grain)} /></div> : null)))}
        />
        <p className="text-muted-foreground text-xs">
          Days without deliveries are not shown. Their share of the monthly costs still counts in net profit.
        </p>
      </TabsContent>
      <TabsContent value="week">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {byWeek.map((w) => (
            <div key={w.start}>
              <Card row={w.row} title={weekLabel(w.start, w.end)} />
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
