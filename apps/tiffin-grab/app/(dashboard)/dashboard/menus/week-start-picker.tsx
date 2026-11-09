"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Calendar } from "@foundry/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { formatDateOnly } from "@/lib/format/datetime";
import { isoToLocalDate, localIso } from "@foundry/commons/util/dates";

function label(value: string): string {
  if (!value) return "Pick a Monday";
  return formatDateOnly(value, { mode: "weekday" });
}

// Week menus always start on a Monday; the calendar disables every other day so
// the constraint is enforced at the input, not validated after the fact.
export function WeekStartPicker({
  value, onChange, disabledDates = [],
}: { value: string; onChange: (iso: string) => void; disabledDates?: string[] }) {
  const [open, setOpen] = useState(false);
  const selected = value ? isoToLocalDate(value) : undefined;
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
          disabled={(date) => date.getDay() !== 1 || taken.has(localIso(date))}
          onSelect={(d) => {
            if (d) onChange(localIso(d));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
