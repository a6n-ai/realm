"use client";

import { pillClass } from "../../../_leads/pill";
import { allowedDaysError, dayAllowed, eatingDaysError, onlyOnMessage, type DayOfWeek } from "@/lib/menu/delivery-days";

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const dayName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

export interface ScheduleFrequency {
  key: string;
  name: string;
  weekdays: DayOfWeek[];
  savePct?: number;
}

interface Props {
  frequencies: ScheduleFrequency[];
  frequencyKey: string;
  onFrequencyChange: (key: string) => void;
  eatingDays: DayOfWeek[];
  onToggleDay: (day: DayOfWeek) => void;
  bounds: { min: number; max: number };
  /** The meal size's allowed days; other days can't be picked. Null/unset = every day. */
  mealDays?: DayOfWeek[] | null;
}

export function ScheduleSection({ frequencies, frequencyKey, onFrequencyChange, eatingDays, onToggleDay, bounds, mealDays }: Props) {
  const deliveryDays = frequencies.find((f) => f.key === frequencyKey)?.weekdays ?? [];
  const enough = eatingDays.length >= bounds.min;
  const error = enough ? (eatingDaysError(deliveryDays, eatingDays, bounds) ?? allowedDaysError(eatingDays, mealDays)) : null;

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Delivery days" className="grid gap-2">
        <p className="text-sm font-medium">Delivery days</p>
        <div className="flex flex-wrap gap-2">
          {frequencies.map((f) => {
            const on = f.key === frequencyKey;
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onFrequencyChange(f.key)}
                title={f.weekdays.map(dayName).join(" · ")}
                className={pillClass(on)}
              >
                {f.name}
                {!!f.savePct && <span className="text-primary text-xs font-semibold tabular-nums">Save {f.savePct}%</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">Eating days</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            <span className="text-foreground font-semibold">{eatingDays.length}</span> {eatingDays.length === 1 ? "tiffin" : "tiffins"} a week · {bounds.min} to {bounds.max}
          </p>
        </div>
        <DayPicker
          selected={eatingDays}
          onToggle={onToggleDay}
          isDisabled={(d, on) => !on && (eatingDays.length >= bounds.max || !dayAllowed(d, mealDays))}
        />
        {mealDays?.length ? <p className="text-muted-foreground text-xs">{onlyOnMessage(mealDays)}.</p> : null}
        {(error || !enough) && (
          <p role="alert" className="text-destructive text-xs">{error ?? `Pick ${bounds.min} to ${bounds.max} eating days a week.`}</p>
        )}
      </div>
    </div>
  );
}

/** The 7 weekday toggles, shared by eating days and trial days so both read the same. */
export function DayPicker({
  selected,
  onToggle,
  isDisabled,
  label,
}: {
  selected: DayOfWeek[];
  onToggle: (day: DayOfWeek) => void;
  isDisabled: (day: DayOfWeek, on: boolean) => boolean;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-7 gap-1.5">
      {DAYS.map((d) => {
        const on = selected.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            disabled={isDisabled(d, on)}
            onClick={() => onToggle(d)}
            className={pillClass(on)}
          >
            {dayName(d)}
          </button>
        );
      })}
    </div>
  );
}
