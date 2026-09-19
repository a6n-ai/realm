import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { WEEK_DAYS, scheduleError, selectableFrequencies, tiffinBounds, type WizardSelections } from "../selections";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";
import { savePct } from "@/lib/pricing/discounts";
import { defaultEatingDays, planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";

const LABEL: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pill = (on: boolean) =>
  `flex h-12 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full border px-0 text-[14px] sm:px-3 sm:text-[15px] font-semibold transition-[transform,background-color,border-color] duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:active:scale-100 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`;
const H = "text-muted-foreground text-[13px] font-semibold tracking-[0.02em]";

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
  const catalogFrequencies = selectableFrequencies(catalog);
  // Display order only: the default selection below still follows catalog order.
  const frequencies = [...catalogFrequencies].sort((a, b) => (a.weekdays?.length ?? 0) - (b.weekdays?.length ?? 0));
  const bounds = tiffinBounds(catalog);
  const row = frequencies.find((f) => f.key === selections.frequencyKey);
  const deliveryDays = (row?.weekdays ?? []) as DayOfWeek[];
  const eating = selections.eatingDays ?? [];
  const reduce = useReducedMotion();

  const setEating = (days: DayOfWeek[]) => {
    const sorted = WEEK_DAYS.filter((d) => days.includes(d));
    set({ eatingDays: sorted, includeSaturday: sorted.includes("sat"), includeSunday: sorted.includes("sun") });
  };

  // Initial selections are static, so pick the first real frequency and clip the default week once the catalog is known.
  useEffect(() => {
    if (row || !catalogFrequencies[0]) return;
    set({ frequencyKey: catalogFrequencies[0].key });
    setEating(defaultEatingDays(catalogFrequencies[0].weekdays as DayOfWeek[], bounds.max));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, frequencies.length]);

  const toggle = (day: DayOfWeek) => {
    if (eating.includes(day)) {
      if (eating.length > bounds.min) setEating(eating.filter((d) => d !== day));
    } else if (eating.length < bounds.max) setEating([...eating, day]);
  };

  const trips = row ? planWeek(deliveryDays, eating) : null;
  const error = row && eating.length >= bounds.min ? scheduleError(catalog, selections) : null;
  const atMax = eating.length >= bounds.max;
  const atMin = eating.length <= bounds.min;
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };

  return (
    <div className="space-y-8">
      {currentPlan ? (
        <CurrentPlanHint>
          Your current plan runs <strong>{currentPlan.daysPerWeek} days/wk</strong>. Set the
          schedule for this new subscription independently.
        </CurrentPlanHint>
      ) : null}

      <section aria-labelledby="sched-eating">
        <h2 id="sched-eating" className={H}>Which days do you eat?</h2>
        <div className="mt-3 flex gap-1.5 sm:gap-2">
          {WEEK_DAYS.map((day) => {
            const on = eating.includes(day);
            return (
              <button key={day} type="button" aria-pressed={on} disabled={on ? atMin : atMax} onClick={() => toggle(day)} className={pill(on)}>
                {LABEL[day]}
              </button>
            );
          })}
        </div>
        <p className="mt-4 flex items-baseline justify-between gap-3" aria-live="polite">
          <span className="leading-none">
            <span className="text-primary text-[28px] font-bold tracking-[-0.03em] tabular-nums">{eating.length}</span>
            <span className="text-muted-foreground ml-1 text-sm font-medium">{eating.length === 1 ? "tiffin" : "tiffins"} a week</span>
          </span>
          <span className={`text-[13px] ${eating.length < bounds.min ? "text-destructive font-medium" : "text-muted-foreground"}`}>Pick {bounds.min} to {bounds.max} days</span>
        </p>
        {error ? <p role="alert" className="text-destructive mt-2 text-sm text-pretty">{error}</p> : null}
      </section>

      <section aria-labelledby="sched-delivery">
        <h2 id="sched-delivery" className={H}>How should we deliver?</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {frequencies.map((f) => {
            const active = f.key === selections.frequencyKey;
            const save = savePct(catalog.discounts, "delivery", f.publicId, 0, catalog.maxDiscountPct);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  set({ frequencyKey: f.key });
                  // Only follow the new frequency while eating days are still the previous one's default.
                  const untouched = eating.join() === defaultEatingDays(deliveryDays, bounds.max).join();
                  if (untouched) setEating(defaultEatingDays(f.weekdays as DayOfWeek[], bounds.max));
                }}
                className={`flex min-h-24 cursor-pointer flex-col items-start gap-3 rounded-[20px] border-2 p-4 text-left transition-[transform,background-color,border-color] duration-100 active:scale-[0.97] motion-reduce:active:scale-100 ${active ? "border-primary bg-primary/10" : "border-border bg-card"}`}
              >
                <span>
                  <span className="block text-[28px] leading-none font-bold tracking-[-0.03em]">{f.weekdays?.length} days</span>
                  <span className="sr-only">{f.name}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    {save > 0 && <span aria-label={`Save ${save}%`} className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Save {save}%</span>}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {(f.weekdays as DayOfWeek[]).map((d) => (
                    <span key={d} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{LABEL[d]}</span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="sched-preview" className="bg-card border-border rounded-[20px] border p-5">
        <div className="flex items-end justify-between gap-3">
          <h2 id="sched-preview" className={H}>How your tiffins arrive</h2>
          <p className="text-right leading-none">
            <span className="text-primary text-[40px] font-bold tracking-[-0.03em] tabular-nums">{eating.length}</span>
            <span className="text-muted-foreground ml-1.5 text-sm font-medium">{eating.length === 1 ? "tiffin" : "tiffins"} a week</span>
          </p>
        </div>
        {trips ? (
          <ul
            aria-label="Delivery preview"
            className="mt-4 grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
            style={{ "--cols": Math.max(1, trips.length) } as React.CSSProperties}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {trips.map((t) => (
                <motion.li
                  key={t.day}
                  layout={!reduce}
                  initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduce ? 0 : -8 }}
                  transition={spring}
                  className="bg-muted/50 border-border flex min-h-[104px] min-w-0 flex-col gap-2 rounded-2xl border p-3.5"
                >
                  <span className="text-[22px] leading-none font-bold tracking-[-0.03em]">{LABEL[t.day]}</span>
                  <span className="text-primary text-[15px] font-semibold">{plural(t.units, "tiffin", "tiffins")}</span>
                  <span className="mt-auto flex flex-wrap gap-1">
                    {t.days.map((e) => (
                      <span key={e} className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">{LABEL[e]}</span>
                    ))}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : null}
      </section>
    </div>
  );
}
