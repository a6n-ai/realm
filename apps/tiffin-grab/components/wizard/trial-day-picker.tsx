"use client";

import { PillToggle } from "@/components/customer/kit";
import { toggleTrialPick } from "@/lib/trial/schedule";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { WEEK_DAYS } from "./selections";

const LABEL: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

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
              {LABEL[day]}
            </PillToggle>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-3 text-[13px] tabular-nums" aria-live="polite">
        <span className="text-foreground font-semibold">{picked.length}</span> of {maxDays} days
      </p>
    </div>
  );
}
