"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Calendar } from "@realm/ui/calendar";
import { Label } from "@realm/ui/label";
import { cn } from "@realm/ui/cn";
import { formatDateOnly } from "@/lib/format/datetime";
import { toIsoLocal } from "./calendar-constants";

export function VacationDateField({
  id,
  label,
  optionalHint,
  value,
  onChange,
  today,
  minDate,
  isDisabledDay,
  open,
  onOpenChange,
}: {
  id: string;
  label: string;
  optionalHint?: string;
  value: string;
  onChange: (iso: string) => void;
  today: string;
  minDate?: string;
  isDisabledDay: (date: Date) => boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const min = minDate ?? today;

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    const iso = toIsoLocal(date);
    if (iso < min) return;
    onChange(iso);
    onOpenChange(false);
  }

  const display = value
    ? formatDateOnly(value, { mode: "short" })
    : "Select date";

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optionalHint ? (
          <span className="text-muted-foreground font-normal">{optionalHint}</span>
        ) : null}
      </Label>
      <Button
        id={id}
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "h-11 w-full justify-start gap-2.5 font-normal tabular-nums transition-transform active:scale-[0.99]",
          !value && "text-muted-foreground",
          open && "border-primary ring-primary/20 ring-2",
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{display}</span>
      </Button>
      {open ? (
        <div className="animate-in fade-in-0 slide-in-from-top-1 overflow-hidden rounded-xl border bg-card p-1 duration-200 motion-reduce:animate-none">
          <Calendar
            mode="single"
            today={new Date(`${today}T00:00:00`)}
            selected={selected}
            defaultMonth={selected ?? new Date(`${today}T00:00:00`)}
            disabled={isDisabledDay}
            onSelect={handleSelect}
            className="mx-auto"
          />
        </div>
      ) : null}
    </div>
  );
}
