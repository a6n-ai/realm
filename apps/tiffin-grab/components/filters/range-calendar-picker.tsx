"use client";

import { useId, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import { Calendar } from "@foundry/ui/calendar";
import { zonedEndOfDay, zonedStartOfDay } from "@foundry/ui/date-range-picker";
import { Input } from "@foundry/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";

// Same shape as react-day-picker's DateRange; Calendar comes from @foundry/ui
// (which owns that dependency), so the app does not need a direct install.
type DateRange = { from: Date; to?: Date };

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dayYearFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

// Epoch ms -> a browser-local Date on the same calendar day as `ms` in `timeZone`.
const toCalendarDay = (ms: number, tz: string) => {
  const [y, m, d] = zonedDateIso(ms, tz).split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

const toBounds = (r: { from: Date; to: Date }, tz: string) => ({
  from: zonedStartOfDay(r.from.getFullYear(), r.from.getMonth(), r.from.getDate(), tz),
  to: zonedEndOfDay(r.to.getFullYear(), r.to.getMonth(), r.to.getDate(), tz),
});

function triggerText(from: Date, to: Date | undefined) {
  if (!to || to.getTime() === from.getTime()) return dayYearFmt.format(from);
  return from.getFullYear() === to.getFullYear()
    ? `${dayFmt.format(from)} – ${dayYearFmt.format(to)}`
    : `${dayYearFmt.format(from)} – ${dayYearFmt.format(to)}`;
}

/** "Nov 1, 2026" or "2026-11-01" to a local calendar day; null when it names no real day. */
function parseDay(text: string): Date | null {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const long = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(t);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  else if (long) [y, m, d] = [Number(long[3]), MONTH_NAMES.findIndex((n) => n.startsWith(long[1]!.toLowerCase())), Number(long[2])];
  else return null;
  const date = new Date(y, m, d);
  // Date rolls Feb 30 into March; only a round-trip means the day exists.
  return m >= 0 && date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
}

export function RangeCalendarPicker({
  from, to, onChange, label = "Any date", clearLabel = "Any date", timeZone, triggerClassName,
}: {
  from?: number;
  to?: number;
  onChange: (r: { from?: number; to?: number }) => void;
  label?: string;
  clearLabel?: string;
  timeZone?: string;
  triggerClassName?: string;
}) {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const committed: DateRange | undefined =
    from != null ? { from: toCalendarDay(from, tz), to: to != null ? toCalendarDay(to, tz) : undefined } : undefined;
  const uid = useId();
  const [open, setOpen] = useState(false);
  // Calendar clicks and typing both edit this draft; the URL changes only on Apply.
  const [draft, setDraft] = useState<DateRange | undefined>(committed);
  const [month, setMonth] = useState<Date>(committed?.from ?? new Date());
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");

  const load = (range: DateRange | undefined) => {
    setDraft(range);
    setStartText(range ? dayYearFmt.format(range.from) : "");
    setEndText(range?.to ? dayYearFmt.format(range.to) : "");
  };

  const openChange = (next: boolean) => {
    if (next) {
      load(committed);
      setMonth(committed?.from ?? toCalendarDay(Date.now(), tz));
    }
    setOpen(next);
  };

  const parsedStart = parseDay(startText);
  const parsedEnd = endText.trim() === "" ? null : parseDay(endText);
  const startInvalid = startText.trim() !== "" && !parsedStart;
  const endInvalid = endText.trim() !== "" && (!parsedEnd || (parsedStart != null && parsedEnd < parsedStart));
  const canApply = parsedStart != null && !endInvalid;

  const edit = (setText: (v: string) => void, other: "from" | "to", text: string) => {
    setText(text);
    const day = parseDay(text);
    if (!day) return;
    setMonth(day);
    setDraft((d) => ({ from: d?.from ?? day, to: d?.to, [other]: day }));
  };

  const apply = () => {
    if (!canApply) return;
    onChange(toBounds({ from: parsedStart, to: parsedEnd ?? parsedStart }, tz));
    setOpen(false);
  };

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    apply();
  };

  const triggerLabel = committed ? triggerText(committed.from, committed.to) : label;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger render={<Button variant="outline" className={cn("h-9 justify-start gap-2 font-normal tabular-nums", from == null && "text-muted-foreground", triggerClassName)} />}>
        <CalendarIcon className="text-muted-foreground size-4" aria-hidden="true" />
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-3 rounded-(--ui-radius-popup)! p-3">
        <Calendar
          mode="range"
          weekStartsOn={1}
          month={month}
          onMonthChange={setMonth}
          selected={draft}
          className="p-0"
          onSelect={(_range, day) => {
            // A click on a finished range starts a new one; the default range mode would only move one end.
            if (!draft?.from || draft.to) return load({ from: day, to: undefined });
            const [a, b] = day < draft.from ? [day, draft.from] : [draft.from, day];
            load({ from: a, to: b });
          }}
        />
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <label htmlFor={`${uid}-start`} className="text-muted-foreground text-sm">Start</label>
          <Input
            id={`${uid}-start`}
            aria-invalid={startInvalid || undefined}
            value={startText}
            placeholder="Nov 1, 2026"
            onChange={(e) => edit(setStartText, "from", e.target.value)}
            onKeyDown={onEnter}
          />
          <label htmlFor={`${uid}-end`} className="text-muted-foreground text-sm">End</label>
          <Input
            id={`${uid}-end`}
            aria-invalid={endInvalid || undefined}
            value={endText}
            placeholder="Nov 30, 2026"
            onChange={(e) => edit(setEndText, "to", e.target.value)}
            onKeyDown={onEnter}
          />
        </div>
        <Button className="h-9 w-full" disabled={!canApply} onClick={apply}>
          Apply <span aria-hidden="true">↵</span>
        </Button>
        {from != null && (
          <Button
            variant="ghost"
            className="text-muted-foreground h-9 w-full"
            onClick={() => {
              onChange({});
              setOpen(false);
            }}
          >
            {clearLabel}
          </Button>
        )}
        <p className="text-muted-foreground text-center text-xs">{tz}</p>
      </PopoverContent>
    </Popover>
  );
}
