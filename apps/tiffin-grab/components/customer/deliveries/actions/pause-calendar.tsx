"use client";
import { parseIsoDateUtc } from "@foundry/commons";
import { humanDate } from "@/lib/deliveries-view";
import type { PauseDayChoice } from "@/app/(customer)/me/deliveries/actions";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * One grid per month the days span, Monday first; the leading blanks line day 1 up under its
 * weekday. Week rows with no plan day at a month's start or end are dropped, so a plan starting
 * on the 23rd does not open on three empty weeks.
 */
function months(dates: string[]): { label: string; cells: (string | null)[] }[] {
  const has = new Set(dates);
  const keys = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
  return keys.map((key) => {
    const first = parseIsoDateUtc(`${key}-01`);
    const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let i = 0; i < count; i++) cells.push(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))));
    while (cells.length % 7) cells.push(null);
    const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
    const used = rows.map((row) => row.some((d) => d != null && has.has(d)));
    const kept = rows.slice(used.indexOf(true), used.lastIndexOf(true) + 1);
    return { label: MONTH.format(first), cells: kept.flat() };
  });
}

const DOT = "relative flex size-11 items-center justify-center rounded-full border-[1.5px] text-[15px] font-semibold tabular-nums [touch-action:manipulation] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

/**
 * The pause drawer's days as round buttons on a month grid, so a long plan reads at a glance
 * instead of as a list. A delivery day toggles into the pause pick and a paused day into the resume
 * pick (one footer button saves both); a paused day past its cutoff opens Move. Days off the plan
 * are bare numbers.
 */
export function PauseCalendar({ days, picked, resuming, canPick, atCap, pending, onPick, onResume, onMove }: {
  days: PauseDayChoice[];
  picked: string[];
  resuming: string[];
  canPick: boolean;
  atCap: boolean;
  pending: boolean;
  onPick: (date: string) => void;
  onResume: (date: string) => void;
  onMove?: (date: string) => void;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return (
    <div className="space-y-5">
      {months(days.map((d) => d.date)).map((m) => (
        <div key={m.label} className="space-y-2">
          <h3 className="text-sm font-semibold">{m.label}</h3>
          <div role="group" aria-label={m.label} className="grid grid-cols-7 justify-items-center gap-y-1.5">
            {WEEK.map((w) => <span key={w} aria-hidden className="text-xs font-semibold text-[var(--muted-foreground)]">{w}</span>)}
            {m.cells.map((date, i) => {
              if (!date) return <span key={`b${i}`} aria-hidden />;
              const day = byDate.get(date);
              const n = parseIsoDateUtc(date).getUTCDate();
              if (!day) return <span key={date} aria-hidden className="flex size-11 items-center justify-center text-[13px] text-[var(--muted-foreground)] opacity-50">{n}</span>;
              const name = humanDate(date);
              if (day.paused && day.lapsed) {
                return (
                  <button key={date} type="button" aria-label={`${name}, paused past cutoff. Move`} disabled={!onMove || pending} onClick={() => onMove?.(date)}
                    className={`${DOT} border-dashed border-[var(--muted-foreground)] text-[var(--muted-foreground)] disabled:opacity-40`}>{n}</button>
                );
              }
              if (day.paused) {
                const back = resuming.includes(date);
                return (
                  <button key={date} type="button" aria-label={`${name}, paused`} aria-pressed={back} disabled={pending} onClick={() => onResume(date)}
                    className={`${DOT} ${back ? "border-[var(--primary)] bg-[var(--card)] text-[var(--foreground)] ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card)]" : "border-dashed border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--foreground)]"}`}>{n}</button>
                );
              }
              const on = picked.includes(date);
              const blocked = !canPick || (!on && atCap);
              return (
                <button key={date} type="button" aria-label={name} aria-pressed={on} aria-disabled={blocked || undefined} onClick={() => !blocked && onPick(date)}
                  className={`${DOT} ${on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]"} ${blocked ? "opacity-40" : ""}`}>{n}</button>
              );
            })}
          </div>
        </div>
      ))}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full border-[1.5px] border-[var(--border)]" />Delivery</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full bg-[var(--primary)]" />To pause</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full border-[1.5px] border-dashed border-[var(--primary)]" />Paused</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full border-[1.5px] border-[var(--primary)] ring-1 ring-[var(--primary)] ring-offset-1" />To resume</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full border-[1.5px] border-dashed border-[var(--muted-foreground)]" />Past cutoff (tap to move)</li>
      </ul>
    </div>
  );
}
