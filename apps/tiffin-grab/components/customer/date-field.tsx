"use client";

import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { DatePicker } from "@/components/customer/kit";
import { formatDateOnly } from "@/lib/format/datetime";

/** Customer date picker — never a native `<input type="date">`. Opens the kit Sheet with a month grid. */
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
  const allowed = allowedDays && allowedDays.length > 0 ? allowedDays : undefined;
  return (
    <DatePicker
      id={id}
      label={label}
      hint={optionalHint}
      value={value}
      onChange={onChange}
      format={(iso) => formatDateOnly(iso)}
      min={minDate ?? today}
      max={maxDate}
      disabledReason={(iso) => (allowed && !allowed.includes(weekdayKey(parseIsoDateUtc(iso))) ? "Not a delivery day" : undefined)}
    />
  );
}
