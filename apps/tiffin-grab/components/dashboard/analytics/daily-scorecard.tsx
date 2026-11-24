"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { ChartEmpty } from "@/components/dashboard/analytics/chart-boundary";
import { DayCard, DayGridView, signedMoney } from "@/components/dashboard/analytics/day-card";
import { DayOrdersDialog } from "@/components/dashboard/analytics/day-orders-dialog";
import { useFormatMoney } from "@/components/app-currency";
import { dayGrid } from "@/lib/analytics/day-grid";
import { addDaysIso, isoToUtcDate, mondayIndex } from "@foundry/commons/util/dates";
import type { OrderCostRow } from "@/lib/analytics/order-weeks.service";

export type ScorecardDay = {
  date: string;
  revenue: number;
  orders: number;
  deliveries: number;
  skipped: number;
  signups: number;
  complaints: number;
  profit: number | null;
  href: string;
};

type Column = { key: Exclude<keyof ScorecardDay, "date" | "href">; label: string; money?: boolean };

const COLUMNS: Column[] = [
  { key: "revenue", label: "Net revenue", money: true },
  { key: "orders", label: "Orders", money: false },
  { key: "deliveries", label: "Deliveries to date", money: false },
  { key: "skipped", label: "Skipped", money: false },
  { key: "signups", label: "Signups", money: false },
  { key: "complaints", label: "Complaints", money: false },
  { key: "profit", label: "Profit", money: true },
];

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

/** "Oct 31 · Saturday": date first, then the full day name. */
export function dayLabel(isoDate: string) {
  const d = isoToUtcDate(isoDate);
  return `${DATE.format(d)} · ${WEEKDAY.format(d)}`;
}

type Figures = Omit<ScorecardDay, "date" | "href">;
export type ScorecardWeek = Figures & { start: string; end: string; days: ScorecardDay[] };

/** Mon–Sun weeks, oldest first; totals are plain sums of the days (profit stays null only when every day is null). */
export function groupByWeek(rows: ScorecardDay[]): ScorecardWeek[] {
  const weeks = new Map<string, ScorecardWeek>();
  for (const r of rows) {
    const start = addDaysIso(r.date, -mondayIndex(r.date));
    let w = weeks.get(start);
    if (!w) {
      w = { start, end: addDaysIso(start, 6), days: [], revenue: 0, orders: 0, deliveries: 0, skipped: 0, signups: 0, complaints: 0, profit: null };
      weeks.set(start, w);
    }
    w.days.push(r);
    for (const c of COLUMNS) {
      const v = r[c.key];
      if (v === null) continue;
      w[c.key] = ((w[c.key] ?? 0) as number) + v;
    }
  }
  return [...weeks.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** "Oct 26 – Nov 1" */
export function weekLabel(start: string, end: string) {
  const f = (iso: string) => DATE.format(isoToUtcDate(iso));
  return `${f(start)} – ${f(end)}`;
}

const num = (n: number) => n.toLocaleString();

type Fmt = (n: number) => string;

function figures(r: Figures, fmt: Fmt): [string, string][] {
  return COLUMNS.map((c) => {
    const v = r[c.key];
    return [c.label, v === null ? "—" : c.key === "profit" ? signedMoney(v, fmt) : c.money ? fmt(v) : num(v)];
  });
}

function DayFace({ title, r, fmt }: { title: string; r: Figures; fmt: Fmt }) {
  const tone =
    r.profit == null || r.profit === 0
      ? "text-muted-foreground"
      : r.profit < 0
        ? "text-destructive"
        : "text-success-foreground dark:text-success";
  return (
    <>
      <span className="font-medium">{title}</span>
      <dl className="flex flex-col gap-0.5 text-xs tabular-nums">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Net revenue</dt>
          <dd>{fmt(r.revenue)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Deliveries</dt>
          <dd>{num(r.deliveries)}</dd>
        </div>
      </dl>
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>{r.profit == null ? "—" : signedMoney(r.profit, fmt)}</span>
    </>
  );
}

function figureCard(
  fmt: Fmt,
  title: string,
  r: Figures & { date?: string; href?: string },
  extra: { muted?: boolean; orders?: OrderCostRow[] },
) {
  const details = figures(r, fmt);
  // Week totals keep the light popover; day cards with finance profit open the order dialog.
  if (r.date != null && r.profit != null && extra.orders !== undefined) {
    return (
      <DayOrdersDialog
        title={dayLabel(r.date)}
        trigger={<DayFace title={title} r={r} fmt={fmt} />}
        summary={details}
        orders={extra.orders}
        dayProfit={r.profit}
        muted={extra.muted}
      />
    );
  }
  return (
    <DayCard
      title={title}
      stats={[
        ["Net revenue", fmt(r.revenue)],
        ["Deliveries", num(r.deliveries)],
      ]}
      profit={r.profit}
      details={details}
      href={r.href}
      muted={extra.muted}
    />
  );
}

/** Per-day figures as Mon–Sun cards; "By week" shows week totals. A day's dialog lists orders used for that day's profit. */
export function DailyScorecard({
  rows,
  ordersByDay = {},
}: {
  rows: ScorecardDay[];
  /** Delivered-order costing keyed by ISO date; only days with finance profit use it. */
  ordersByDay?: Record<string, OrderCostRow[]>;
}) {
  const fmt = useFormatMoney();
  if (rows.length === 0) return <ChartEmpty message="No days in this range." />;
  const weeks = groupByWeek(rows);
  return (
    <Tabs defaultValue="day" className="flex flex-col gap-3">
      <TabsList>
        <TabsTrigger value="day">By day</TabsTrigger>
        <TabsTrigger value="week">By week</TabsTrigger>
      </TabsList>
      <TabsContent value="day">
        <DayGridView
          columns={7}
          weeks={dayGrid(rows).map((w) =>
            w.map((r) =>
              r ? (
                <div key={r.date}>
                  {figureCard(fmt, dayLabel(r.date).split(" · ")[0]!, r, {
                    href: r.href,
                    muted: mondayIndex(r.date) >= 5 || r.deliveries === 0,
                    orders: ordersByDay[r.date] ?? [],
                  })}
                </div>
              ) : null,
            ),
          )}
        />
      </TabsContent>
      <TabsContent value="week">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {weeks.map((w) => (
            <div key={w.start}>{figureCard(fmt, weekLabel(w.start, w.end), w, {})}</div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
