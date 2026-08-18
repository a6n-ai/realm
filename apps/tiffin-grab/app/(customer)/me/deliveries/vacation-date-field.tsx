"use client";

import { useState } from "react";
import { format } from "date-fns";
import { parseIsoDateUtc } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Calendar } from "@realm/ui/calendar";
import { Label } from "@realm/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@realm/ui/popover";
import { CalendarIcon } from "lucide-react";

// Themed popover, not a native <input type="date">: the OS's own calendar
// chrome doesn't match the rest of the app. Still picks exactly one day —
// this isn't a range calendar, matching the vacation/pool-scheduling flows
// that use it.
export function VacationDateField({
  id,
  label,
  optionalHint,
  value,
  onChange,
  today,
  minDate,
  maxDate,
}: {
  id: string;
  label: string;
  optionalHint?: string;
  value: string;
  onChange: (iso: string) => void;
  today: string;
  minDate?: string;
  maxDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const min = parseIsoDateUtc(minDate ?? today);
  const max = maxDate ? parseIsoDateUtc(maxDate) : undefined;
  const selected = value ? parseIsoDateUtc(value) : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optionalHint ? (
          <span className="text-muted-foreground font-normal">{optionalHint}</span>
        ) : null}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="h-11 w-full justify-start font-normal tabular-nums"
          >
            <CalendarIcon className="mr-2 size-4 shrink-0" />
            {selected ? format(selected, "MMM d, yyyy") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? min}
            startMonth={min}
            endMonth={max}
            disabled={{ before: min, ...(max ? { after: max } : {}) }}
            onSelect={(date) => {
              if (!date) return;
              onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
