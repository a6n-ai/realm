"use client";

import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "./button";
import { MonthGrid } from "./dates";
import { IconButton } from "./icon-button";
import { Label } from "./field";
import { Sheet } from "./sheet";
import { cn, FONT } from "./cn";

const monthOf = (iso: string) => iso.slice(0, 7);
const shift = (month: string, n: number) => {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const TITLE = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });

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
  const days: Record<string, { disabledReason?: string }> = {};
  const count = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate();
  for (let i = 1; i <= count; i++) {
    const iso = `${month}-${String(i).padStart(2, "0")}`;
    const why = iso < min ? "Before the earliest available date" : max && iso > max ? "After the latest available date" : disabledReason?.(iso);
    if (why) days[iso] = { disabledReason: why };
  }
  const canPrev = month > monthOf(min);
  const canNext = !max || month < monthOf(max);
  return (
    <div className={cn(FONT, "space-y-1.5")}>
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
          setOpen(true);
        }}
      >
        <CalendarIcon aria-hidden className="size-4 shrink-0" />
        {value ? format(value) : "Pick a date"}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex items-center justify-between pb-3">
          <IconButton aria-label="Previous month" disabled={!canPrev} className="disabled:opacity-35" onClick={() => canPrev && setMonth(shift(month, -1))}>
            <ChevronLeft aria-hidden className="size-5" />
          </IconButton>
          <span aria-live="polite" className="text-[15px] font-semibold">
            {TITLE.format(new Date(`${month}-01T00:00:00Z`))}
          </span>
          <IconButton aria-label="Next month" disabled={!canNext} className="disabled:opacity-35" onClick={() => canNext && setMonth(shift(month, 1))}>
            <ChevronRight aria-hidden className="size-5" />
          </IconButton>
        </div>
        <div className="pb-4">
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
      </Sheet>
    </div>
  );
}
