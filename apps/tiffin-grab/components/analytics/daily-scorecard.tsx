"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
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
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

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

/** Per-day figures for the range, newest first. A row opens that day's orders. */
export function DailyScorecard({ rows }: { rows: ScorecardDay[] }) {
  const router = useRouter();
  if (rows.length === 0) return <ChartEmpty message="No days in this range." />;
  const ranges = Object.fromEntries(COLUMNS.map((c) => [c.key, range(rows, c.key)]));
  return (
    <div className="max-h-[32rem] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-card sticky top-0 z-10">Day</TableHead>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className="bg-card sticky top-0 z-10 text-right">
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
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
                    aria-label={`${DAY.format(new Date(`${r.date}T00:00:00Z`))}: open orders`}
                    className="focus-visible:ring-ring/50 rounded-sm outline-none hover:underline focus-visible:ring-2"
                  >
                    {DAY.format(new Date(`${r.date}T00:00:00Z`))}
                  </Link>
                </TableCell>
                {COLUMNS.map((c) => {
                  const v = r[c.key];
                  const cell = "py-0 text-right tabular-nums";
                  if (c.key === SIGNED) {
                    if (v === null) return <TableCell key={c.key} className={cn(cell, "text-muted-foreground")}>—</TableCell>;
                    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
                    return (
                      <TableCell key={c.key} className={cn(cell, v > 0 && "text-success", v < 0 && "text-destructive", v === 0 && "text-muted-foreground")}>
                        {sign}
                        {CAD.format(Math.abs(v))}
                      </TableCell>
                    );
                  }
                  if (v === null || v === 0) {
                    return <TableCell key={c.key} className={cn(cell, "text-muted-foreground")}>—</TableCell>;
                  }
                  return (
                    <TableCell key={c.key} className={cn(cell, !muted && "text-foreground")} style={muted || v < 0 ? undefined : { background: tint(v, ranges[c.key]!) }}>
                      {c.money ? CAD.format(v) : v.toLocaleString()}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
