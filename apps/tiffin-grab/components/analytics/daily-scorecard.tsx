"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { ChartEmpty } from "@/components/analytics/chart-boundary";
import { DayCard, DayGridView, signedMoney } from "@/components/analytics/day-card";
import { useFormatMoney } from "@/components/app-currency";
import { dayGrid } from "@/lib/analytics/day-grid";
import { addDaysIso, isoToUtcDate, mondayIndex } from "@/lib/dates";

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
  { key: "orders", label: "Orders" },
  { key: "deliveries", label: "Deliveries to date" },
  { key: "skipped", label: "Skipped" },
  { key: "signups", label: "Signups" },
  { key: "complaints", label: "Complaints" },
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

function figureCard(fmt: Fmt, title: string, r: Figures, extra: { href?: string; muted?: boolean }) {
  return (
    <DayCard
      title={title}
      stats={[
        ["Net revenue", fmt(r.revenue)],
        ["Deliveries", num(r.deliveries)],
      ]}
      profit={r.profit}
      details={figures(r, fmt)}
      {...extra}
    />
  );
}

/** Per-day figures as Mon–Sun cards; "By week" shows week totals. A day's popover links to that day's orders. */
export function DailyScorecard({ rows }: { rows: ScorecardDay[] }) {
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
            w.map((r) => (r ? <div key={r.date}>{figureCard(fmt, dayLabel(r.date).split(" · ")[0]!, r, { href: r.href, muted: mondayIndex(r.date) >= 5 || r.deliveries === 0 })}</div> : null)),
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
