"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function label(value: string): string {
  if (!value) return "Pick a Monday";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Week menus always start on a Monday; the calendar disables every other day so
// the constraint is enforced at the input, not validated after the fact.
export function WeekStartPicker({
  value, onChange, disabledDates = [],
}: { value: string; onChange: (iso: string) => void; disabledDates?: string[] }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const taken = new Set(disabledDates);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-56 justify-start gap-2 font-normal tabular-nums transition-transform active:scale-[0.96]"
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {label(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={(date) => date.getDay() !== 1 || taken.has(toIso(date))}
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
