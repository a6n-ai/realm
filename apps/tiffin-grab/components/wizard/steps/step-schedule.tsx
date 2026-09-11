import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Label } from "@foundry/ui/label";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";
import { clubbedQuantities, customFrequencyKey, orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";

const WEEKDAY_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_LABEL: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function sameDaySet(a: DayOfWeek[], b: DayOfWeek[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

function sorted(days: DayOfWeek[]): DayOfWeek[] {
  return [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
}

/** The weekday set implied by the current selections — an explicit custom
 * pick, or whatever the matched (or hardcoded 5_day/mwf) catalog row implies. */
function currentWeekdays(catalog: ClientCatalogSnapshot, selections: WizardSelections): DayOfWeek[] {
  if (selections.customWeekdays?.length) return sorted(selections.customWeekdays);
  const row = catalog.frequencies.find((f) => f.key === selections.frequencyKey);
  return sorted(orderDeliveryDays({
    frequencyKey: selections.frequencyKey,
    weekdays: (row?.weekdays as DayOfWeek[] | null) ?? null,
    includeSaturday: false,
    includeSunday: false,
  }));
}

/** An active catalog row whose weekday set exactly matches — this is the only
 * thing that earns a discount; a same-count-but-different-days custom pick
 * never does. */
function matchingRow(catalog: ClientCatalogSnapshot, weekdays: DayOfWeek[]) {
  return catalog.frequencies.find((f) => {
    const rowDays = (f.weekdays as DayOfWeek[] | null) ?? (f.key === "mwf" ? ["mon", "wed", "fri"] : f.key === "5_day" ? ["mon", "tue", "wed", "thu", "fri"] : null);
    return rowDays && sameDaySet(rowDays as DayOfWeek[], weekdays);
  });
}

export function StepSchedule({
  catalog,
  selections,
  set,
  currentPlan = null,
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  currentPlan?: CurrentPlanSummary | null;
}) {
  const tiffinCounts = [...new Set(catalog.frequencies.map((f) => f.daysPerWeek))].sort((a, b) => a - b);
  const weekdays = currentWeekdays(catalog, selections);
  const tiffinCount = weekdays.length;
  const match = matchingRow(catalog, weekdays);
  const quantities = clubbedQuantities(weekdays);

  const pickCount = (count: number) => {
    // Default to the first admin pattern at this count so switching counts
    // lands on a real (possibly discounted) cadence, not an arbitrary pick.
    const defaultRow = catalog.frequencies.find((f) => f.daysPerWeek === count);
    if (defaultRow) {
      set({ frequencyKey: defaultRow.key, customWeekdays: undefined });
    } else {
      const days = WEEKDAY_ORDER.slice(0, count);
      set({ frequencyKey: customFrequencyKey(days), customWeekdays: days });
    }
  };

  const toggleDay = (day: DayOfWeek) => {
    let next: DayOfWeek[];
    if (weekdays.includes(day)) {
      // Never let the picker collapse to zero days — a customer must always
      // have at least one delivery day to remove-toggle down to.
      if (weekdays.length <= 1) return;
      next = weekdays.filter((d) => d !== day);
    } else if (weekdays.length < tiffinCount) {
      next = sorted([...weekdays, day]);
    } else {
      // At the cap: drop the oldest pick (start of the sorted week) to make
      // room, rather than blocking the tap — keeps the flow moving.
      next = sorted([...weekdays.slice(1), day]);
    }
    const row = matchingRow(catalog, next);
    if (row) set({ frequencyKey: row.key, customWeekdays: undefined });
    else set({ frequencyKey: customFrequencyKey(next), customWeekdays: next });
  };

  return (
    <div className="space-y-6">
      {currentPlan ? (
        <CurrentPlanHint>
          Your current plan runs <strong>{currentPlan.daysPerWeek} days/wk</strong>. Set the
          schedule for this new subscription independently.
        </CurrentPlanHint>
      ) : null}

      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Tiffins per week</Label>
        <div className="mt-3 flex flex-wrap gap-3">
          {tiffinCounts.map((count) => {
            const active = tiffinCount === count;
            return (
              <button
                key={count}
                type="button"
                onClick={() => pickCount(count)}
                className={`border-foreground flex h-[54px] min-w-[54px] cursor-pointer items-center justify-center rounded-full border-[1.5px] px-5 text-lg font-semibold tabular-nums transition-transform active:scale-[0.97] ${active ? "bg-primary text-primary-foreground" : ""}`}
              >
                {count}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          {tiffinCount} {tiffinCount === 1 ? "tiffin" : "tiffins"} → {tiffinCount} {tiffinCount === 1 ? "delivery" : "deliveries"}/week
        </p>
      </div>

      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Delivery days</Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {WEEKDAY_ORDER.map((day) => {
            const active = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={active}
                className={`border-foreground flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] px-4 text-sm font-semibold transition-transform active:scale-[0.97] ${active ? "bg-primary text-primary-foreground" : ""}`}
              >
                {WEEKDAY_LABEL[day]}
              </button>
            );
          })}
        </div>

        <div className="mt-3 min-h-[44px] rounded-2xl border-[1.5px] border-foreground/10 bg-muted/30 px-4 py-3 text-sm transition-colors">
          {match && match.courierDiscountPct > 0 ? (
            <p className="text-primary font-medium">
              Eligible for {match.courierDiscountPct}% off — matches our {match.name} plan.
            </p>
          ) : match ? (
            <p className="text-foreground/80">Standard schedule — no clubbing needed, one tiffin per delivery.</p>
          ) : (
            <p className="text-foreground/80">Custom schedule — standard pricing, tiffins clubbed onto your chosen days.</p>
          )}
        </div>

        {tiffinCount < 7 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map((day) => (
              <div
                key={day}
                className={`flex h-9 min-w-9 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${weekdays.includes(day) ? "bg-primary/15 text-primary" : "text-muted-foreground/50"}`}
                title={WEEKDAY_LABEL[day]}
              >
                {weekdays.includes(day) ? quantities[day] : "–"}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
