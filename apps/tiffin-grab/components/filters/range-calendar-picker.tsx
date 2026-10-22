"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { endOfMonth, startOfMonth, subDays, subMonths } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import { Calendar } from "@foundry/ui/calendar";
import { zonedEndOfDay, zonedStartOfDay } from "@foundry/ui/date-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";

// ReUI c-calendar-29 (range calendar with presets), wired to epoch-ms bounds in the business timezone.

const fmt = (ms: number, timeZone: string) =>
  new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone });

// Epoch ms -> a browser-local Date on the same calendar day as `ms` in `timeZone`.
const toCalendarDay = (ms: number, tz: string) => {
  const [y, m, d] = zonedDateIso(ms, tz).split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

const toBounds = (r: { from: Date; to: Date }, tz: string) => ({
  from: zonedStartOfDay(r.from.getFullYear(), r.from.getMonth(), r.from.getDate(), tz),
  to: zonedEndOfDay(r.to.getFullYear(), r.to.getMonth(), r.to.getDate(), tz),
});

function presets(today: Date) {
  const lastMonth = subMonths(today, 1);
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: subDays(today, 1), to: subDays(today, 1) },
    { label: "Last 7 days", from: subDays(today, 6), to: today },
    { label: "Last 30 days", from: subDays(today, 29), to: today },
    { label: "This month", from: startOfMonth(today), to: endOfMonth(today) },
    { label: "Last month", from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) },
  ];
}

export function RangeCalendarPicker({
  from, to, onChange, label = "Any date", timeZone,
}: {
  from?: number;
  to?: number;
  onChange: (r: { from?: number; to?: number }) => void;
  label?: string;
  timeZone?: string;
}) {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const committed: DateRange | undefined =
    from != null ? { from: toCalendarDay(from, tz), to: to != null ? toCalendarDay(to, tz) : undefined } : undefined;
  const [open, setOpen] = useState(false);
  // Clicks build a draft; the URL changes only once both ends are picked.
  const [draft, setDraft] = useState<DateRange | undefined>(committed);
  const [month, setMonth] = useState<Date>(committed?.from ?? new Date());
  const today = toCalendarDay(Date.now(), tz);

  const openChange = (next: boolean) => {
    if (next) {
      setDraft(committed);
      setMonth(committed?.from ?? today);
    }
    setOpen(next);
  };
  const commit = (r: { from: Date; to: Date }) => {
    onChange(toBounds(r, tz));
    setOpen(false);
  };

  const triggerLabel = from != null ? `${fmt(from, tz)}${to != null ? ` – ${fmt(to, tz)}` : ""}` : label;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start gap-2 font-normal tabular-nums", from == null && "text-muted-foreground")}>
          <CalendarIcon className="text-muted-foreground size-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex max-sm:flex-col">
          <div className="flex flex-col gap-1 p-2 max-sm:order-1 max-sm:border-t sm:w-32 sm:border-e">
            {presets(today).map((p) => (
              <Button key={p.label} variant="ghost" size="sm" className="w-full justify-start" onClick={() => commit(p)}>
                {p.label}
              </Button>
            ))}
            {from != null && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground w-full justify-start"
                onClick={() => {
                  onChange({});
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <Calendar
            mode="range"
            month={month}
            onMonthChange={setMonth}
            selected={draft}
            onSelect={(_range, day) => {
              // A click on a finished range starts a new one; react-day-picker would only move one end.
              if (!draft?.from || draft.to) return setDraft({ from: day, to: undefined });
              const [a, b] = day < draft.from ? [day, draft.from] : [draft.from, day];
              setDraft({ from: a, to: b });
              commit({ from: a, to: b });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
