"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { DayCard, DayGridView, signedMoney } from "@/components/dashboard/analytics/day-card";
import { DayOrdersDialog } from "@/components/dashboard/analytics/day-orders-dialog";
import { useFormatMoney } from "@/components/app-currency";
import { weekLabel } from "@/components/dashboard/analytics/daily-scorecard";
import { groupProfitWeeks } from "@/lib/analytics/profit-weeks";
import { ChartEmpty } from "@/components/dashboard/analytics/chart-boundary";
import { profitCalendar } from "@/lib/analytics/profit-calendar";
import { periodLabel, type Grain, type ProfitRow } from "@/lib/analytics/profitability";
import type { OrderCostRow } from "@/lib/analytics/order-weeks.service";
import { mondayIndex } from "@foundry/commons/util/dates";

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

function details(row: ProfitRow, fmt: (n: number) => string): [string, string][] {
  return [
    ["Food", fmt(row.food)],
    ["Driver", fmt(row.driver)],
    ["Marketing", fmt(row.marketing)],
    ["Salaries", fmt(row.salaries)],
    ["Other", fmt(row.other)],
    ["Coupons", row.coupons > 0 ? `−${fmt(row.coupons)}` : fmt(0)],
    ["Cash collected", fmt(row.cashCollected)],
    ["Margin", pct(row.marginPct)],
  ];
}

function CardFace({ title, row, fmt }: { title: string; row: ProfitRow; fmt: (n: number) => string }) {
  const tone =
    row.profit === 0 ? "text-muted-foreground" : row.profit < 0 ? "text-destructive" : "text-success-foreground dark:text-success";
  return (
    <>
      <span className="font-medium">{title}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {row.tiffins} {row.tiffins === 1 ? "tiffin" : "tiffins"}
      </span>
      <dl className="flex flex-col gap-0.5 text-xs tabular-nums">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Earned</dt>
          <dd>{fmt(row.revenue)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Cost</dt>
          <dd>{fmt(row.costs)}</dd>
        </div>
      </dl>
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>{signedMoney(row.profit, fmt)}</span>
    </>
  );
}

function Card({
  row,
  title,
  orders,
}: {
  row: ProfitRow;
  title: string;
  /** When set (daily grain), click opens the per-order cost dialog. */
  orders?: OrderCostRow[];
}) {
  const fmt = useFormatMoney();
  if (orders !== undefined) {
    return (
      <DayOrdersDialog
        title={title}
        trigger={<CardFace title={title} row={row} fmt={fmt} />}
        summary={details(row, fmt)}
        orders={orders}
        dayProfit={row.profit}
        muted={mondayIndex(row.date) >= 5 || row.tiffins === 0}
      />
    );
  }
  return (
    <DayCard
      title={title}
      sub={`${row.tiffins} ${row.tiffins === 1 ? "tiffin" : "tiffins"}`}
      stats={[
        ["Earned", fmt(row.revenue)],
        ["Cost", fmt(row.costs)],
      ]}
      profit={row.profit}
      details={details(row, fmt)}
    />
  );
}

/** Daily: a Mon–Fri calendar of days that had deliveries, with a By week tab. Weekly and monthly: one card per period. */
export function DayCards({
  rows,
  grain,
  from,
  to,
  ordersByDay = {},
}: {
  rows: ProfitRow[];
  grain: Grain;
  from: string;
  to: string;
  ordersByDay?: Record<string, OrderCostRow[]>;
}) {
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
          weeks={weeks.map((w) =>
            w.map((r) =>
              r ? (
                <div key={r.date}>
                  <Card row={r} title={periodLabel(r.date, grain)} orders={ordersByDay[r.date] ?? []} />
                </div>
              ) : null,
            ),
          )}
        />
        <p className="text-muted-foreground text-xs">
          Days without deliveries are not shown. Their share of the monthly costs still counts in net profit. Open a day for each order&apos;s price, cost and contribution.
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
