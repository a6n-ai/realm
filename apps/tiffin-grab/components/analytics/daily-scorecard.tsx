"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { cn } from "@foundry/ui/cn";
import { ChartEmpty } from "@/components/analytics/chart-boundary";
import { heatBucket, heatIsDense, heatOpacity, mondayIndex } from "@/components/analytics/chart-math";

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

type Column = { key: Exclude<keyof ScorecardDay, "date" | "href">; label: string; color: string; money?: boolean };

// Each column is shaded on its own scale, so colour never compares one metric with another.
const COLUMNS: Column[] = [
  { key: "revenue", label: "Net revenue", color: "var(--chart-1)", money: true },
  { key: "orders", label: "Orders", color: "var(--chart-2)" },
  { key: "deliveries", label: "Deliveries", color: "var(--chart-3)" },
  { key: "skipped", label: "Skipped", color: "var(--warning)" },
  { key: "signups", label: "Signups", color: "var(--chart-5)" },
  { key: "complaints", label: "Complaints", color: "var(--destructive)" },
  { key: "profit", label: "Profit", color: "var(--success)", money: true },
];

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function range(rows: ScorecardDay[], key: Column["key"]) {
  const v = rows.map((r) => r[key]).filter((x): x is number => typeof x === "number");
  const pos = v.filter((x) => x > 0);
  const neg = v.filter((x) => x < 0).map((x) => -x);
  return { posMin: Math.min(...pos), posMax: Math.max(...pos), negMin: Math.min(...neg), negMax: Math.max(...neg) };
}

/** Per-day figures for the range, newest first. A row opens that day's orders. */
export function DailyScorecard({ rows }: { rows: ScorecardDay[] }) {
  const router = useRouter();
  if (rows.length === 0) return <ChartEmpty message="No days in this range." />;
  const ranges = Object.fromEntries(COLUMNS.map((c) => [c.key, range(rows, c.key)]));
  const profitMissing = rows.every((r) => r.profit === null);
  return (
    <div className="flex flex-col gap-3">
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
                  className={cn("cursor-pointer", muted && "text-muted-foreground")}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("a")) router.push(r.href);
                  }}
                >
                  <TableCell className="whitespace-nowrap">
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
                    if (v === null) {
                      return (
                        <TableCell key={c.key} className="text-muted-foreground text-right">
                          —
                        </TableCell>
                      );
                    }
                    const rg = ranges[c.key]!;
                    const negative = v < 0;
                    const bucket = negative
                      ? heatBucket(-v, rg.negMin, rg.negMax)
                      : heatBucket(v, rg.posMin, rg.posMax);
                    const color = negative ? "var(--destructive)" : c.color;
                    return (
                      <TableCell key={c.key} className="relative p-0 text-right tabular-nums">
                        <span
                          aria-hidden
                          className="absolute inset-0"
                          style={{ background: color, opacity: heatOpacity(bucket) * (muted ? 0.5 : 1) }}
                        />
                        <span
                          className={cn(
                            "relative block px-2 py-2",
                            !muted && heatIsDense(bucket) && "text-background font-medium",
                            bucket === 0 && "text-muted-foreground",
                          )}
                        >
                          {c.money ? CAD.format(v) : v.toLocaleString()}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {profitMissing ? (
        <p className="text-muted-foreground text-xs">Profit: coming with Profitability, which will leave WP-migrated tiffins out.</p>
      ) : null}
    </div>
  );
}
