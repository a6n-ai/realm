"use client";

import { cn } from "@foundry/ui/cn";
import { eatingDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";

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
}

const press = "transition-[transform,background-color,border-color] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export function ScheduleSection({ frequencies, frequencyKey, onFrequencyChange, eatingDays, onToggleDay, bounds }: Props) {
  const deliveryDays = frequencies.find((f) => f.key === frequencyKey)?.weekdays ?? [];
  const enough = eatingDays.length >= bounds.min;
  const error = enough ? eatingDaysError(deliveryDays, eatingDays, bounds) : null;

  return (
    <div className="grid gap-5">
      <div role="radiogroup" aria-label="Delivery days" className="grid gap-2">
        <p className="text-sm font-medium">Delivery days</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {frequencies.map((f) => {
            const on = f.key === frequencyKey;
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onFrequencyChange(f.key)}
                className={cn(
                  "grid min-h-11 gap-0.5 rounded-lg border px-3 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  press,
                  on ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {f.name}
                  {!!f.savePct && (
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">Save {f.savePct}%</span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{f.weekdays.map(dayName).join(" · ")}</span>
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
          isDisabled={(_, on) => !on && eatingDays.length >= bounds.max}
        />
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
            className={cn(
              "min-h-11 min-w-0 rounded-lg border text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40",
              press,
              on ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted/50",
            )}
          >
            {dayName(d)}
          </button>
        );
      })}
    </div>
  );
}
