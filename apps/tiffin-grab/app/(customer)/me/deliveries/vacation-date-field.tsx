"use client";

import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";

/** Native date input — no calendar popup; used for vacation and pool scheduling. */
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
  const min = minDate ?? today;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optionalHint ? (
          <span className="text-muted-foreground font-normal">{optionalHint}</span>
        ) : null}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={maxDate}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full tabular-nums"
      />
    </div>
  );
}
