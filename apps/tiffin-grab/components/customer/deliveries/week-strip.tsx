"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STATUS_COLOR, STATUS_LABEL } from "@/components/customer/kit";
import { cn, FOCUS } from "@/components/customer/kit/cn";
import { addDays, mondayOf, weekDays, weekTimeline, type Agenda } from "@/lib/deliveries-view/week";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { Legend } from "./week-timeline";

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MON = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const WD = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

interface Props {
  firstWeek: string;
  lastWeek: string;
  week: string;
  today: string;
  selectedDay: string | null;
  agenda: Agenda;
  now: number;
  onPickDay: (iso: string) => void;
  onWeek: (monday: string) => void;
}

/** Compact 7-day date picker for the customer page: a dot under each day you eat, coloured by status. */
export function WeekStrip({ firstWeek, lastWeek, week, today, selectedDay, agenda, now, onPickDay, onWeek }: Props) {
  const { trips, dayStatus } = weekTimeline(agenda, week, now);
  const isos = weekDays(week);
  const thisWeek = mondayOf(today);
  const arrives = new Map(trips.map((t) => [t.day, t.units]));
  const arrow = cn(FOCUS, "grid size-9 place-items-center rounded-full disabled:opacity-30 [touch-action:manipulation]");

  return (
    <section aria-label="Delivery week" data-testid="week-timeline">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground,#6E6558)]">
          {MON.format(at(week))} – {MON.format(at(addDays(week, 6)))}{week === thisWeek ? " · This week" : ""}
        </p>
        <span className="flex items-center">
          <Legend />
          <button type="button" aria-label="Previous week" disabled={week <= firstWeek} onClick={() => onWeek(addDays(week, -7))} className={arrow}><ChevronLeft aria-hidden className="size-4" /></button>
          <button type="button" aria-label="Next week" disabled={week >= lastWeek} onClick={() => onWeek(addDays(week, 7))} className={arrow}><ChevronRight aria-hidden className="size-4" /></button>
        </span>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {isos.map((iso, i) => {
          const s = dayStatus[DAYS[i]!];
          const units = arrives.get(DAYS[i]!);
          const selected = iso === selectedDay;
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={selected}
              aria-label={`${LONG.format(at(iso))}${s ? `, eating, ${STATUS_LABEL[s]}` : ", nothing planned"}${units ? `, delivery arrives with ${units} ${units === 1 ? "tiffin" : "tiffins"}` : ""}`}
              onClick={() => onPickDay(iso)}
              className={cn(
                FOCUS,
                "flex flex-col items-center gap-1 rounded-2xl py-2 [touch-action:manipulation]",
                selected ? "bg-[var(--primary-wash,#FBE3D2)] text-[var(--foreground)]" : iso < today && "opacity-45",
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground,#6E6558)]">{WD.format(at(iso)).slice(0, 3)}</span>
              <span className={cn("grid size-8 place-items-center rounded-full text-[15px] font-semibold tabular-nums", iso === today && "ring-[1.5px] ring-[var(--primary)]")}>{at(iso).getUTCDate()}</span>
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: s ? STATUS_COLOR[s] : "transparent" }} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
