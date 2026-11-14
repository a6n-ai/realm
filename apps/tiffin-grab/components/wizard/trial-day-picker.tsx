"use client";

import { WEEK_DAYS } from "@/lib/deliveries/schedule/delivery-days";
import { PillToggle } from "@/components/kit";
import { toggleTrialPick } from "@/lib/trial/schedule";
import type { DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import { DAY_SHORT } from "@/lib/dates/weekdays";


/** Weekday toggles for a multi-day trial: send days only, 1 to `maxDays` picked. */
export function TrialDayPicker({
  sendDays,
  maxDays,
  picked,
  onChange,
}: {
  sendDays: readonly string[];
  maxDays: number;
  picked: readonly string[];
  onChange: (days: DayOfWeek[]) => void;
}) {
  return (
    <div>
      <div role="group" aria-label="Trial days" className="flex gap-1.5 sm:gap-2">
        {WEEK_DAYS.map((day) => {
          const on = picked.includes(day);
          return (
            <PillToggle
              key={day}
              on={on}
              disabled={!on && (!sendDays.includes(day) || picked.length >= maxDays)}
              onClick={() => onChange(toggleTrialPick(picked, day, sendDays, maxDays))}
            >
              {DAY_SHORT[day]}
            </PillToggle>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-3 text-footnote tabular-nums" aria-live="polite">
        <span className="text-foreground font-semibold">{picked.length}</span> of {maxDays} days
      </p>
    </div>
  );
}
