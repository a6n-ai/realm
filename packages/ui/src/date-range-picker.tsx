"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./cn";

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

function preset(days: number): { from: number; to: number } {
  const now = new Date();
  const to = endOfDay(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { from: startOfDay(start), to };
}

export function DateRangePicker({
  from, to, onChange, label = "Any date",
}: {
  from?: number;
  to?: number;
  onChange: (r: { from?: number; to?: number }) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined =
    from != null ? { from: new Date(from), to: to != null ? new Date(to) : undefined } : undefined;
  const triggerLabel =
    from != null ? `${fmt(from)}${to != null ? ` – ${fmt(to)}` : ""}` : label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start gap-2 font-normal tabular-nums transition-transform active:scale-[0.97]",
            from == null && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-wrap gap-1 border-b p-2">
          {[
            { label: "Today", days: 1 },
            { label: "7 days", days: 7 },
            { label: "30 days", days: 30 },
          ].map((p) => (
            <Button
              key={p.label}
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(preset(p.days));
                setOpen(false);
              }}
            >
              {p.label}
            </Button>
          ))}
          {from != null && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
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
          numberOfMonths={2}
          selected={selected}
          defaultMonth={selected?.from}
          onSelect={(r) =>
            onChange({
              from: r?.from ? startOfDay(r.from) : undefined,
              to: r?.to ? endOfDay(r.to) : undefined,
            })
          }
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function DatePicker({
  value, onChange, placeholder = "Pick a date",
}: {
  value?: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start gap-2 font-normal tabular-nums",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {value
            ? new Date(`${value}T00:00:00`).toLocaleDateString("en-CA", {
                month: "short", day: "numeric", year: "numeric",
              })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) onChange(toIso(d));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
