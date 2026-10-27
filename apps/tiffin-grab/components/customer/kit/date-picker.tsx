"use client";

import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { MonthGrid } from "./dates";
import { IconButton } from "./icon-button";
import { Label } from "./field";
import { Sheet } from "./sheet";
import { cn, FONT } from "./cn";
import { useSwipePages } from "./use-swipe-pages";

const monthOf = (iso: string) => iso.slice(0, 7);
const shift = (month: string, n: number) => {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
/** md+ gets an anchored popover, phones get the bottom sheet. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const q = matchMedia("(min-width: 768px)");
    const on = () => setWide(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return wide;
}
const TITLE = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, i, 1))));

interface DatePickerProps {
  id: string;
  label: string;
  hint?: string;
  /** ISO yyyy-mm-dd, "" for none. */
  value: string;
  onChange: (iso: string) => void;
  /** Text shown on the trigger for the current value. */
  format: (iso: string) => string;
  min: string;
  max?: string;
  /** Reason a day cannot be picked, or undefined when it can. Shown when the disabled day is tapped. */
  disabledReason?: (iso: string) => string | undefined;
}

/** Date picker: a trigger button that opens the kit Sheet with a month grid. Never a native date input. */
export function DatePicker({ id, label, hint, value, onChange, format, min, max, disabledReason }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(value || min));
  const [above, setAbove] = useState(false);
  // Tapping the title swaps the day grid for a month/year grid, so a far date is two taps, not many swipes.
  const [jump, setJump] = useState(false);
  const days: Record<string, { disabledReason?: string }> = {};
  const count = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate();
  for (let i = 1; i <= count; i++) {
    const iso = `${month}-${String(i).padStart(2, "0")}`;
    const why = iso < min ? "Before the earliest available date" : max && iso > max ? "After the latest available date" : disabledReason?.(iso);
    if (why) days[iso] = { disabledReason: why };
  }
  const wide = useWide();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !wide) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, wide]);
  const canPrev = month > monthOf(min);
  const canNext = !max || month < monthOf(max);
  // Swipe months like the deliveries calendar; the chevrons slide the same way.
  const { ref: swipe, bind, go } = useSwipePages({ page: month, canPrev, canNext, step: (dir) => setMonth((m) => shift(m, dir)) });
  const year = +month.slice(0, 4);
  const firstMonth = monthOf(min);
  const lastMonth = max ? monthOf(max) : null;
  const monthKey = (y: number, i: number) => `${y}-${String(i + 1).padStart(2, "0")}`;
  const picker = (
    <>
        <div className="flex items-center justify-between pb-3">
          <IconButton
            bare
            aria-label={jump ? "Previous year" : "Previous month"}
            disabled={jump ? year <= +firstMonth.slice(0, 4) : !canPrev}
            className="disabled:opacity-35"
            onClick={() => (jump ? setMonth(monthKey(year - 1, +month.slice(5) - 1) < firstMonth ? firstMonth : monthKey(year - 1, +month.slice(5) - 1)) : canPrev && go(-1))}
          >
            <ChevronLeft aria-hidden className="size-5" />
          </IconButton>
          <button
            type="button"
            aria-expanded={jump}
            aria-live="polite"
            onClick={() => setJump(!jump)}
            className="flex min-h-11 items-center gap-1 rounded-full px-3 text-[15px] font-semibold transition-colors hover:bg-[var(--muted)]"
          >
            {jump ? year : TITLE.format(new Date(`${month}-01T00:00:00Z`))}
            <ChevronDown aria-hidden className={cn("size-4 text-[var(--muted-foreground)] transition-transform duration-200", jump && "rotate-180")} />
          </button>
          <IconButton
            bare
            aria-label={jump ? "Next year" : "Next month"}
            disabled={jump ? !!lastMonth && year >= +lastMonth.slice(0, 4) : !canNext}
            className="disabled:opacity-35"
            onClick={() => (jump ? setMonth(lastMonth && monthKey(year + 1, +month.slice(5) - 1) > lastMonth ? lastMonth : monthKey(year + 1, +month.slice(5) - 1)) : canNext && go(1))}
          >
            <ChevronRight aria-hidden className="size-5" />
          </IconButton>
        </div>
        {jump ? (
          // Same height as the six-row day grid, so the sheet does not resize between the two views.
          <div role="group" aria-label={`Months in ${year}`} className="grid h-[276px] grid-cols-3 grid-rows-4 gap-2 pb-4">
            {MONTHS.map((name, i) => {
              const key = monthKey(year, i);
              const off = key < firstMonth || (!!lastMonth && key > lastMonth);
              const on = key === month;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={off}
                  aria-pressed={on}
                  onClick={() => (setMonth(key), setJump(false))}
                  className={cn(
                    "rounded-2xl text-[15px] font-semibold transition-colors disabled:opacity-35",
                    on ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "bg-[var(--muted)] text-[var(--foreground)]",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : (
        <div ref={swipe} {...bind} className="pb-4 [touch-action:pan-y] motion-reduce:!transform-none">
          <MonthGrid
            key={month}
            month={month}
            days={days}
            selected={value || undefined}
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
        )}
    </>
  );
  return (
    <div ref={box} className={cn(FONT, "relative space-y-1.5")}>
      <Label htmlFor={id}>
        {label}
        {hint ? <span className="font-normal text-[var(--muted-foreground)]">{hint}</span> : null}
      </Label>
      <Button
        id={id}
        variant="quiet"
        aria-haspopup="dialog"
        className="!min-h-12 w-full justify-start !rounded-2xl !border font-normal tabular-nums"
        onClick={() => {
          setMonth(monthOf(value || min));
          setJump(false);
          const r = box.current?.getBoundingClientRect();
          setAbove(!!r && innerHeight - r.bottom < 380 && r.top > 380);
          setOpen(true);
        }}
      >
        <CalendarIcon aria-hidden className="size-4 shrink-0" />
        {value ? format(value) : "Pick a date"}
      </Button>
      {wide ? (
        open && (
          <div role="dialog" aria-label={label} className={cn("c-surface absolute left-0 z-50 w-[325px] rounded-2xl bg-[var(--card)] p-4 shadow-[0_8px_30px_rgba(0,0,0,.14)]", above ? "bottom-[calc(100%-20px)]" : "top-full mt-2")}>
            {picker}
          </div>
        )
      ) : (
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {picker}
      </Sheet>
      )}
    </div>
  );
}
