"use client";

import { cn } from "@foundry/ui/cn";
import { eatingDaysError, planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const label = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

export interface ScheduleFrequency {
  key: string;
  name: string;
  weekdays: DayOfWeek[];
  courierDiscountPct?: number;
}

interface Props {
  frequencies: ScheduleFrequency[];
  frequencyKey: string;
  onFrequencyChange: (key: string) => void;
  eatingDays: DayOfWeek[];
  onToggleDay: (day: DayOfWeek) => void;
  bounds: { min: number; max: number };
}

const press = "transition-[transform,opacity] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export function ScheduleSection({ frequencies, frequencyKey, onFrequencyChange, eatingDays, onToggleDay, bounds }: Props) {
  const deliveryDays = frequencies.find((f) => f.key === frequencyKey)?.weekdays ?? [];
  const enough = eatingDays.length >= bounds.min;
  const error = enough ? eatingDaysError(deliveryDays, eatingDays, bounds) : null;
  const trips = planWeek(deliveryDays, eatingDays);

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Delivery days" className="space-y-2">
        <p className="text-sm font-medium text-foreground">Delivery days <span className="text-destructive">*</span></p>
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
                className={cn("min-h-[44px] rounded-lg border p-3 text-left", press, on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input bg-background hover:bg-muted/50")}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">{f.name}{!!f.courierDiscountPct && <span aria-label={`Save ${f.courierDiscountPct}%`} className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">{f.courierDiscountPct}% off</span>}</span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {f.weekdays.map((d) => (
                    <span key={d} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{label(d)}</span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Which days do you eat? <span className="text-destructive">*</span></p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => {
            const on = eatingDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                disabled={on ? eatingDays.length <= bounds.min : eatingDays.length >= bounds.max}
                onClick={() => onToggleDay(d)}
                className={cn("min-h-[44px] min-w-0 rounded-lg border text-sm font-medium disabled:opacity-40", press, on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-foreground hover:bg-muted/50")}
              >
                {label(d)}
              </button>
            );
          })}
        </div>
        <p className="text-foreground">
          <span className="text-2xl font-semibold tabular-nums">{eatingDays.length}</span>{" "}
          <span className="text-sm">tiffins a week</span>{" "}
          <span className="text-muted-foreground text-xs">({bounds.min}–{bounds.max})</span>
        </p>
        {error || !enough ? (
          <p role="alert" className="text-destructive text-xs">{error ?? `Pick between ${bounds.min} and ${bounds.max} eating days a week`}</p>
        ) : null}
      </div>

      {trips && trips.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">How the tiffins arrive</p>
          <ul className="divide-y rounded-lg border">
            {trips.map((t) => (
              <li key={t.day} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{label(t.day)}</span>
                <span className="text-muted-foreground min-w-0 text-right text-xs">
                  {t.units} {t.units === 1 ? "tiffin" : "tiffins"} · {t.days.map(label).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
