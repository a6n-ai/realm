"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { cn } from "@foundry/ui/cn";
import { ChartEmpty } from "@/components/analytics/chart-boundary";
import { mondayIndex } from "@/components/analytics/chart-math";

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

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

/** "Oct 31 · Saturday": date first, then the full day name. */
export function dayLabel(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${DATE.format(d)} · ${WEEKDAY.format(d)}`;
}

/** Profit is the only column with a fill-free, signed reading; it is the one place a zero is a result. */
const SIGNED: Column["key"] = "profit";
const MAX_TINT_PCT = 14;

function range(rows: ScorecardDay[], key: Column["key"]) {
  const v = rows.map((r) => r[key]).filter((x): x is number => typeof x === "number" && x > 0);
  return { min: Math.min(...v), max: Math.max(...v) };
}

// One neutral tint for every column, scaled on that column's own min to max so one metric never shades against another.
function tint(v: number, rg: { min: number; max: number }) {
  const t = rg.max > rg.min ? (v - rg.min) / (rg.max - rg.min) : 1;
  return `color-mix(in oklab, var(--foreground) ${(t * MAX_TINT_PCT).toFixed(1)}%, transparent)`;
}

type Figures = Omit<ScorecardDay, "date" | "href">;
export type ScorecardWeek = Figures & { start: string; end: string; days: ScorecardDay[] };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Mon–Sun weeks, newest first; totals are plain sums of the days (profit stays null only when every day is null). */
export function groupByWeek(rows: ScorecardDay[]): ScorecardWeek[] {
  const weeks = new Map<string, ScorecardWeek>();
  for (const r of rows) {
    const start = addDays(r.date, -mondayIndex(r.date));
    let w = weeks.get(start);
    if (!w) {
      w = { start, end: addDays(start, 6), days: [], revenue: 0, orders: 0, deliveries: 0, skipped: 0, signups: 0, complaints: 0, profit: null };
      weeks.set(start, w);
    }
    w.days.push(r);
    for (const c of COLUMNS) {
      const v = r[c.key];
      if (v === null) continue;
      w[c.key] = ((w[c.key] ?? 0) as number) + v;
    }
  }
  return [...weeks.values()].sort((a, b) => (a.start < b.start ? 1 : -1));
}

/** "Oct 26 – Nov 1" */
export function weekLabel(start: string, end: string) {
  const f = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));
  return `${f(start)} – ${f(end)}`;
}

const CELL = "py-0 text-right tabular-nums";

function FigureCells({ r, muted, ranges }: { r: Figures; muted: boolean; ranges?: Record<string, { min: number; max: number }> }) {
  return (
    <>
      {COLUMNS.map((c) => {
        const v = r[c.key];
        if (c.key === SIGNED) {
          if (v === null) return <TableCell key={c.key} className={cn(CELL, "text-muted-foreground")}>—</TableCell>;
          const sign = v > 0 ? "+" : v < 0 ? "−" : "";
          return (
            <TableCell key={c.key} className={cn(CELL, muted || v === 0 ? "text-muted-foreground" : v > 0 ? "text-success" : "text-destructive")}>
              {sign}
              {CAD.format(Math.abs(v))}
            </TableCell>
          );
        }
        if (v === null || v === 0) return <TableCell key={c.key} className={cn(CELL, "text-muted-foreground")}>—</TableCell>;
        const shade = ranges && !muted && v > 0 ? { background: tint(v, ranges[c.key]!) } : undefined;
        return (
          <TableCell key={c.key} className={cn(CELL, !muted && "text-foreground")} style={shade}>
            {c.money ? CAD.format(v) : v.toLocaleString()}
          </TableCell>
        );
      })}
    </>
  );
}

function Frame({ first, children }: { first: string; children: ReactNode }) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <Table className="table-fixed">
        <colgroup>
          {[null, ...COLUMNS].map((_, i) => (
            <col key={i} style={{ width: `${100 / (COLUMNS.length + 1)}%` }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-card sticky top-0 z-10">{first}</TableHead>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className="bg-card sticky top-0 z-10 text-right">
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

/** Per-day figures for the range, newest first, grouped by Mon–Sun week; a "By week" tab shows week totals. A day row opens that day's orders. */
export function DailyScorecard({ rows }: { rows: ScorecardDay[] }) {
  const router = useRouter();
  if (rows.length === 0) return <ChartEmpty message="No days in this range." />;
  const ranges = Object.fromEntries(COLUMNS.map((c) => [c.key, range(rows, c.key)]));
  const weeks = groupByWeek(rows);
  const weekRanges = Object.fromEntries(COLUMNS.map((c) => [c.key, range(weeks as unknown as ScorecardDay[], c.key)]));
  return (
    <Tabs defaultValue="day" className="flex flex-col gap-3">
      <TabsList>
        <TabsTrigger value="day">By day</TabsTrigger>
        <TabsTrigger value="week">By week</TabsTrigger>
      </TabsList>
      <TabsContent value="day">
        <Frame first="Day">
          {weeks.map((w) => (
            <Fragment key={w.start}>
              <TableRow className="bg-muted/40 h-9 hover:bg-muted/40">
                <TableCell className="py-0 font-medium whitespace-nowrap">Week · {weekLabel(w.start, w.end)}</TableCell>
                <FigureCells r={w} muted={false} />
              </TableRow>
              {w.days.map((r) => {
                const muted = mondayIndex(r.date) >= 5 || r.deliveries === 0;
                return (
                  <TableRow
                    key={r.date}
                    className={cn("h-9 cursor-pointer", muted && "text-muted-foreground")}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a")) router.push(r.href);
                    }}
                  >
                    <TableCell className="py-0 whitespace-nowrap">
                      <Link
                        href={r.href}
                        aria-label={`${dayLabel(r.date)}: open orders`}
                        className="focus-visible:ring-ring/50 rounded-sm outline-none hover:underline focus-visible:ring-2"
                      >
                        {dayLabel(r.date)}
                      </Link>
                    </TableCell>
                    <FigureCells r={r} muted={muted} ranges={ranges} />
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </Frame>
      </TabsContent>
      <TabsContent value="week">
        <Frame first="Week">
          {weeks.map((w) => (
            <TableRow key={w.start} className="h-9">
              <TableCell className="py-0 whitespace-nowrap">{weekLabel(w.start, w.end)}</TableCell>
              <FigureCells r={w} muted={false} ranges={weekRanges} />
            </TableRow>
          ))}
        </Frame>
      </TabsContent>
    </Tabs>
  );
}
