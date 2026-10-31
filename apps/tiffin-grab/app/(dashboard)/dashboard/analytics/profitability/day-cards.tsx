"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { cn } from "@foundry/ui/cn";
import { ChartEmpty } from "@/components/analytics/chart-boundary";
import { profitCalendar } from "@/lib/analytics/profit-calendar";
import { periodLabel, type Grain, type ProfitRow } from "@/lib/analytics/profitability";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const money = (n: number) => CAD.format(n);
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
// The sign carries the meaning, so colour is never the only cue.
const signed = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : money(0));

function Card({ row, grain }: { row: ProfitRow; grain: Grain }) {
  const tone = row.profit < 0 ? "text-destructive" : row.profit > 0 ? "text-success-foreground dark:text-success" : "";
  const title = periodLabel(row.date, grain);
  const lines: [string, string][] = [
    ["Kitchen", money(row.kitchen)],
    ["Driver", money(row.driver)],
    ["Marketing", money(row.marketing)],
    ["Salaries", money(row.salaries)],
    ["Other", money(row.other)],
    ["Cash collected", money(row.cashCollected)],
    ["Margin", pct(row.marginPct)],
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="bg-card hover:bg-muted/50 focus-visible:ring-ring/50 flex h-full w-full min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left text-sm outline-none transition-colors focus-visible:ring-2"
        >
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {row.tiffins} {row.tiffins === 1 ? "tiffin" : "tiffins"}
          </span>
          <dl className="flex flex-col gap-0.5 text-xs tabular-nums">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Earned</dt>
              <dd>{money(row.revenue)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Cost</dt>
              <dd>{money(row.costs)}</dd>
            </div>
          </dl>
          <span className={cn("text-sm font-semibold tabular-nums", tone)}>{signed(row.profit)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="font-medium">{title}</p>
        <dl className="flex flex-col gap-1 text-xs tabular-nums">
          {lines.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** Daily: a Mon–Fri calendar of days that had deliveries. Weekly and monthly: one card per period. */
export function DayCards({ rows, grain, from, to }: { rows: ProfitRow[]; grain: Grain; from: string; to: string }) {
  if (grain !== "daily") {
    if (rows.length === 0) return <ChartEmpty message="No periods in this range." />;
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <Card key={r.date} row={r} grain={grain} />
        ))}
      </div>
    );
  }
  const { columns, weeks } = profitCalendar(rows, from, to);
  if (weeks.length === 0) return <ChartEmpty message="No deliveries in this range." />;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="flex min-w-[40rem] flex-col gap-2">
          <div className="text-muted-foreground grid gap-2 text-xs" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {WEEKDAYS.slice(0, columns).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weeks.map((w, i) => (
            <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {w.map((r, j) => (r ? <Card key={r.date} row={r} grain={grain} /> : <div key={j} aria-hidden />))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Days without deliveries are not shown. Their share of the monthly costs still counts in net profit.
      </p>
    </div>
  );
}
