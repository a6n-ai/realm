import { useEffect } from "react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { DEFAULT_EATING_DAYS, WEEK_DAYS, scheduleError, selectableFrequencies, tiffinBounds, type WizardSelections } from "../selections";
import { Label } from "@foundry/ui/label";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";
import { planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";

const LABEL: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pill = (on: boolean) =>
  `border-foreground flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] px-4 text-sm font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${on ? "bg-primary text-primary-foreground" : ""}`;

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
  const frequencies = selectableFrequencies(catalog);
  const bounds = tiffinBounds(catalog);
  const row = frequencies.find((f) => f.key === selections.frequencyKey);
  const deliveryDays = (row?.weekdays ?? []) as DayOfWeek[];
  const eating = selections.eatingDays ?? [];

  const setEating = (days: DayOfWeek[]) => {
    const sorted = WEEK_DAYS.filter((d) => days.includes(d));
    set({ eatingDays: sorted, includeSaturday: sorted.includes("sat"), includeSunday: sorted.includes("sun") });
  };

  // Initial selections are static, so pick the first real frequency and clip the default week once the catalog is known.
  useEffect(() => {
    if (row || !frequencies[0]) return;
    const days = (selections.eatingDays?.length ? selections.eatingDays : DEFAULT_EATING_DAYS).slice(0, bounds.max);
    set({ frequencyKey: frequencies[0].key });
    setEating(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, frequencies.length]);

  const toggle = (day: DayOfWeek) => {
    if (eating.includes(day)) setEating(eating.filter((d) => d !== day));
    else if (eating.length < bounds.max) setEating([...eating, day]);
  };

  const trips = row ? planWeek(deliveryDays, eating) : null;
  const error = row && eating.length >= bounds.min ? scheduleError(catalog, selections) : null;
  const atMax = eating.length >= bounds.max;

  return (
    <div className="space-y-6">
      {currentPlan ? (
        <CurrentPlanHint>
          Your current plan runs <strong>{currentPlan.daysPerWeek} days/wk</strong>. Set the
          schedule for this new subscription independently.
        </CurrentPlanHint>
      ) : null}

      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Delivery days</Label>
        <div className="mt-3 grid gap-2">
          {frequencies.map((f) => {
            const active = f.key === selections.frequencyKey;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => set({ frequencyKey: f.key })}
                className={`border-foreground/20 flex min-h-[54px] cursor-pointer flex-col items-start rounded-2xl border-[1.5px] px-4 py-2 text-left transition-transform active:scale-[0.99] ${active ? "bg-primary text-primary-foreground" : ""}`}
              >
                <span className="font-semibold">{f.name}</span>
                <span className="text-sm opacity-80">{(f.weekdays as DayOfWeek[]).map((d) => LABEL[d]).join(", ")}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Eating days</Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {WEEK_DAYS.map((day) => {
            const on = eating.includes(day);
            return (
              <button key={day} type="button" aria-pressed={on} disabled={!on && atMax} onClick={() => toggle(day)} className={pill(on)}>
                {LABEL[day]}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          {plural(eating.length, "tiffin", "tiffins")} a week (pick {bounds.min}-{bounds.max})
        </p>

        {error ? (
          <p role="alert" className="text-destructive mt-2 text-sm text-pretty">{error}</p>
        ) : null}

        {trips ? (
          <ul aria-label="Delivery preview" className="mt-3 space-y-1 rounded-2xl border-[1.5px] border-foreground/10 bg-muted/30 px-4 py-3 text-sm">
            {trips.map((t) => (
              <li key={t.day}>
                {LABEL[t.day]}: {plural(t.units, "tiffin", "tiffins")} ({eating.filter((e) => planWeek(deliveryDays, [e])?.[0]?.day === t.day).map((e) => LABEL[e]).join(", ")})
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
