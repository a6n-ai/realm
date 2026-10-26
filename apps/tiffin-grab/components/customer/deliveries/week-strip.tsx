"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Truck } from "lucide-react";
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
/** Past the last week there is nothing more: the grid resists instead of following the finger 1:1. */
const rubberband = (x: number, width: number) => (x * width * 0.55) / (width + 0.55 * Math.abs(x));

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

/** Compact 7-day date picker for the customer page: a dot under each day you eat, coloured by status, and a truck (with the tiffin count when more than one) on each delivery day. */
export function WeekStrip({ firstWeek, lastWeek, week, today, selectedDay, agenda, now, onPickDay, onWeek }: Props) {
  const { trips, dayStatus } = weekTimeline(agenda, week, now);
  const isos = weekDays(week);
  const thisWeek = mondayOf(today);
  const arrives = new Map(trips.map((t) => [t.day, t.units]));
  const canPrev = week > firstWeek;
  const canNext = week < lastWeek;
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; dx: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false);
  const offset = (dx: number) => {
    const el = grid.current;
    if (!el) return;
    const blocked = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
    el.style.transform = dx ? `translateX(${blocked ? rubberband(dx, el.offsetWidth) : dx}px)` : "";
  };
  const settle = () => {
    const el = grid.current;
    if (!el) return;
    el.style.transition = "transform 300ms cubic-bezier(0.22,1,0.36,1)";
    offset(0);
    el.addEventListener("transitionend", () => (el.style.transition = ""), { once: true });
  };
  const arrow = cn(FOCUS, "grid size-9 place-items-center rounded-full disabled:opacity-30 [touch-action:manipulation]");

  return (
    <section aria-label="Delivery week" data-testid="week-timeline" className="rounded-[20px] border-[1.5px] border-[var(--border)] bg-[var(--card,#fff)] px-3 pb-2 pt-3 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground,#6E6558)]">
          {MON.format(at(week))} – {MON.format(at(addDays(week, 6)))}{week === thisWeek ? " · This week" : ""}
        </p>
        <span className="flex items-center">
          <Legend />
          <button type="button" aria-label="Previous week" disabled={!canPrev} onClick={() => onWeek(addDays(week, -7))} className={arrow}><ChevronLeft aria-hidden className="size-4" /></button>
          <button type="button" aria-label="Next week" disabled={!canNext} onClick={() => onWeek(addDays(week, 7))} className={arrow}><ChevronRight aria-hidden className="size-4" /></button>
        </span>
      </div>
      {/* Swipe the days to change week; pan-y keeps vertical scrolling with the browser. */}
      <div
        ref={grid}
        className="mt-1 grid grid-cols-7 gap-1 [touch-action:pan-y] motion-reduce:!transform-none"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, horizontal: null };
          swiped.current = false;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          // Decide the direction once, after a 10px slop, then track 1:1.
          if (d.horizontal === null && Math.hypot(dx, dy) > 10) {
            d.horizontal = Math.abs(dx) > Math.abs(dy);
            if (d.horizontal) e.currentTarget.setPointerCapture(e.pointerId);
          }
          if (!d.horizontal) return;
          d.dx = dx;
          offset(dx);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.horizontal) return;
          swiped.current = true;
          const flick = Math.abs(d.dx) / Math.max(e.timeStamp - d.t, 1) > 0.5;
          settle();
          if (Math.abs(d.dx) > 50 || flick) {
            if (d.dx < 0 && canNext) onWeek(addDays(week, 7));
            else if (d.dx > 0 && canPrev) onWeek(addDays(week, -7));
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          settle();
        }}
        onClickCapture={(e) => {
          // The tap that ends a swipe must not also pick a day.
          if (swiped.current) {
            swiped.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        {isos.map((iso, i) => {
          const s = dayStatus[DAYS[i]!];
          const units = arrives.get(DAYS[i]!);
          const selected = iso === selectedDay;
          const holiday = s === "holiday" ? agenda[iso]?.find((x) => x.holiday)?.holiday : null;
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={selected}
              aria-label={`${LONG.format(at(iso))}${s ? `, eating, ${STATUS_LABEL[s]}${holiday ? `: ${holiday}` : ""}` : ", nothing planned"}${units ? `, delivery arrives with ${units} ${units === 1 ? "tiffin" : "tiffins"}` : ""}`}
              onClick={() => onPickDay(iso)}
              className={cn(
                FOCUS,
                "flex cursor-pointer flex-col items-center gap-1 rounded-2xl py-2 transition-colors [touch-action:manipulation]",
                selected ? "bg-[var(--primary-wash,#FBE3D2)] text-[var(--foreground)]" : cn("hover:bg-[var(--muted)]", iso < today && "opacity-45"),
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground,#6E6558)]">{WD.format(at(iso)).slice(0, 3)}</span>
              <span className={cn("grid size-8 place-items-center rounded-full text-[15px] font-semibold tabular-nums", iso === today && "ring-[1.5px] ring-[var(--primary)]")}>{at(iso).getUTCDate()}</span>
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: s ? STATUS_COLOR[s] : "transparent" }} />
              {/* Fixed height so weeks with and without a truck line up. */}
              <span aria-hidden className="flex h-3.5 items-center gap-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted-foreground,#6E6558)]">
                {units ? (
                  <>
                    <Truck className="size-3.5" />
                    {units > 1 && units}
                  </>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
