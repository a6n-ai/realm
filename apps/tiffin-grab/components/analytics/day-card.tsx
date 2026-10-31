"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { cn } from "@foundry/ui/cn";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
export const cad = (n: number) => CAD.format(n);
// The sign carries the meaning, so colour is never the only cue.
export const signedCad = (n: number) => (n > 0 ? `+${cad(n)}` : n < 0 ? `−${cad(-n)}` : cad(0));

/** One day, week or month: title, a few headline figures, a signed profit, and a popover with the full breakdown. */
export function DayCard({
  title,
  sub,
  stats,
  profit,
  details,
  href,
  muted,
}: {
  title: string;
  sub?: string;
  stats: [string, string][];
  profit: number | null;
  details: [string, string][];
  /** Adds an "Open orders" link to the popover. */
  href?: string;
  muted?: boolean;
}) {
  const tone = profit == null || profit === 0 ? "text-muted-foreground" : profit < 0 ? "text-destructive" : "text-success-foreground dark:text-success";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "bg-card hover:bg-muted/50 focus-visible:ring-ring/50 flex h-full w-full min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left text-sm outline-none transition-colors focus-visible:ring-2",
            muted && "text-muted-foreground",
          )}
        >
          <span className="font-medium">{title}</span>
          {sub ? <span className="text-muted-foreground text-xs tabular-nums">{sub}</span> : null}
          <dl className="flex flex-col gap-0.5 text-xs tabular-nums">
            {stats.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <span className={cn("text-sm font-semibold tabular-nums", tone)}>{profit == null ? "—" : signedCad(profit)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 border">
        <p className="font-medium">{title}</p>
        <dl className="flex flex-col gap-1 text-xs tabular-nums">
          {details.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {href ? (
          <Link href={href} className="text-primary text-xs font-medium hover:underline">
            Open orders
          </Link>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday header plus one row per week; null cells keep the columns aligned. */
export function DayGridView({ columns, weeks }: { columns: number; weeks: (ReactNode | null)[][] }) {
  const cols = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[40rem] flex-col gap-2">
        <div className="text-muted-foreground grid gap-2 text-xs" style={cols}>
          {WEEKDAYS.slice(0, columns).map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="grid gap-2" style={cols}>
            {w.map((cell, j) => (cell ?? <div key={j} aria-hidden />))}
          </div>
        ))}
      </div>
    </div>
  );
}
