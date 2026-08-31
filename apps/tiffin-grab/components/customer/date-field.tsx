"use client";

import { useState } from "react";
import { format } from "date-fns";
import { parseIsoDateUtc, weekdayKey, type Weekday } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Calendar } from "@foundry/ui/calendar";
import { Label } from "@foundry/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { useIsMobile } from "@foundry/ui/use-mobile";
import { CalendarIcon } from "lucide-react";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";

function isoToPickerDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function pickerDateToIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function pickerWeekday(date: Date): Weekday {
  return weekdayKey(parseIsoDateUtc(pickerDateToIso(date)));
}

function DateCalendar({
  value,
  today,
  minDate,
  maxDate,
  allowedDays,
  onSelect,
}: {
  value: string;
  today: string;
  minDate: string;
  maxDate?: string;
  allowedDays?: readonly string[];
  onSelect: (iso: string) => void;
}) {
  const min = isoToPickerDate(minDate);
  const max = maxDate ? isoToPickerDate(maxDate) : undefined;
  const selected = value ? isoToPickerDate(value) : undefined;
  const allowed = allowedDays && allowedDays.length > 0 ? allowedDays : undefined;

  return (
    <Calendar
      mode="single"
      selected={selected}
      today={isoToPickerDate(today)}
      defaultMonth={selected ?? min}
      startMonth={min}
      endMonth={max}
      className="mx-auto [--cell-size:2.75rem]"
      disabled={[
        // YYYY-MM-DD compare so minDate (today) stays selectable; `{ before: Date }` can exclude it.
        (date: Date) => pickerDateToIso(date) < minDate,
        ...(maxDate ? [(date: Date) => pickerDateToIso(date) > maxDate] : []),
        ...(allowed ? [(date: Date) => !allowed.includes(pickerWeekday(date))] : []),
      ]}
      onSelect={(date) => {
        if (!date) return;
        onSelect(pickerDateToIso(date));
      }}
    />
  );
}

/** Customer date picker — never a native `<input type="date">`. Mobile opens a nested bottom drawer. */
export function DateField({
  id,
  label,
  optionalHint,
  value,
  onChange,
  today,
  minDate,
  maxDate,
  allowedDays,
}: {
  id: string;
  label: string;
  optionalHint?: string;
  value: string;
  onChange: (iso: string) => void;
  today: string;
  minDate?: string;
  maxDate?: string;
  allowedDays?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const boundMin = minDate ?? today;

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      className="h-12 min-h-12 w-full justify-start text-base font-normal tabular-nums"
    >
      <CalendarIcon className="mr-2 size-4 shrink-0" />
      {value ? formatDateOnly(value) : "Pick a date"}
    </Button>
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optionalHint ? (
          <span className="text-muted-foreground font-normal">{optionalHint}</span>
        ) : null}
      </Label>
      {isMobile ? (
        <ResponsiveDialog
          open={open}
          onOpenChange={setOpen}
          nested
          handleOnly
          direction="bottom"
          trigger={trigger}
          title={label}
          contentClassName="max-h-[85dvh]"
        >
          <div className="px-4 pb-6" data-vaul-no-drag>
            <DateCalendar
              value={value}
              today={today}
              minDate={boundMin}
              maxDate={maxDate}
              allowedDays={allowedDays}
              onSelect={pick}
            />
          </div>
        </ResponsiveDialog>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <DateCalendar
              value={value}
              today={today}
              minDate={boundMin}
              maxDate={maxDate}
              allowedDays={allowedDays}
              onSelect={pick}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
