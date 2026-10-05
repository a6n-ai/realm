import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "../selections";
import { Choice, ChoiceGroup, Pill } from "@/components/customer/kit";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";
import { durationSavings } from "@/lib/pricing/recommend";
import { formatDateOnly } from "@/lib/format/datetime";
import { DateField } from "@/components/customer/date-field";
import { earliestTrialIso, trialDeliveryDates } from "@/lib/trial/schedule";
import { appToday } from "@/lib/services/start-date";
import { TrialDayPicker } from "../trial-day-picker";
import { orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";
import { subscriptionTrips, tripsByWeek, type DatedTrip } from "@/lib/menu/delivery-dates";
import { formatMenuWeekRange } from "@/lib/format/datetime";
import { TripTimeline } from "../trip-timeline";

function dayBefore(iso: string): string {
  const d = parseIsoDateUtc(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function StepDuration({
  catalog,
  selections,
  set,
  result,
  sameWeekConflict = false,
  currentPlan = null,
  minStartDate = null,
  trial = null,
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  result: PricingResult | null;
  sameWeekConflict?: boolean;
  currentPlan?: CurrentPlanSummary | null;
  minStartDate?: string | null;
  /** Set when the chosen size is a trial: day count replaces the week commitment. */
  trial?: { maxDays: number; weekdays: string[] } | null;
}) {
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const plan = catalog.plans.find((p) => p.key === selections.planKey);
  // A multi-day trial picks its days; a one-day trial just picks a start date on a send day.
  const multiDay = !!trial && trial.maxDays > 1;
  const picks = multiDay ? (selections.eatingDays ?? []).filter((d) => trial.weekdays.includes(d)) : [];
  const allowed = trial ? (picks.length ? picks : trial.weekdays) : (plan?.allowedStartDays ?? ["mon", "tue", "wed", "thu", "fri"]);
  const today = appToday(catalog.timezone);
  const tomorrow = trial ? earliestTrialIso(today, trial.weekdays) : nextWeekday(today).toISOString().slice(0, 10);
  const minDate = minStartDate && minStartDate > tomorrow ? minStartDate : tomorrow;
  const overlapBound = minStartDate != null && minDate === minStartDate;
  // First day on/after minDate that the plan actually delivers on.
  const earliest = (() => {
    const d = parseIsoDateUtc(minDate);
    for (let i = 0; i < 14; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      if (allowed.includes(weekdayKey(d))) return d.toISOString().slice(0, 10);
    }
    return minDate;
  })();
  const freq = catalog.frequencies.find((f) => f.key === selections.frequencyKey);
  const schedule = (() => {
    if (!selections.startDate) return null;
    try {
      if (trial) {
        const days = multiDay ? picks : [weekdayKey(parseIsoDateUtc(selections.startDate))];
        if (!days.length) return null;
        const dates = trialDeliveryDates(selections.startDate, days.length, days);
        return { trips: dates.map((d): DatedTrip => { const day = weekdayKey(parseIsoDateUtc(d)) as DayOfWeek; return { dateIso: d, day, units: 1, days: [day] }; }), shifted: false };
      }
      if (!freq || !selections.eatingDays?.length) return null;
      return subscriptionTrips({
        startDate: selections.startDate,
        durationWeeks: selections.durationWeeks,
        deliveryDays: orderDeliveryDays({ frequencyKey: freq.key, weekdays: freq.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false }),
        eatingDays: selections.eatingDays as DayOfWeek[],
      });
    } catch {
      return null;
    }
  })();
  const savings = useMemo(() => durationSavings(catalog, selections), [catalog, selections]);
  // Pre-select the earliest selectable date; a stale or now-invalid pick is replaced too.
  useEffect(() => {
    const cur = selections.startDate;
    const valid = cur && cur >= minDate && allowed.includes(weekdayKey(parseIsoDateUtc(cur)));
    const days = selections.trialDays;
    const picked = selections.eatingDays ?? [];
    const daysOk = !trial || (multiDay
      ? picks.length >= 1 && picks.length === picked.length && picks.length <= trial.maxDays && days === picks.length
      : days === 1 && picked.length === 0);
    const firstPicks = picks.length ? picks.slice(0, trial?.maxDays) : trial?.weekdays.slice(0, 1) ?? [];
    const fix = daysOk || !trial ? {} : multiDay ? { eatingDays: firstPicks as WizardSelections["eatingDays"], trialDays: firstPicks.length } : { eatingDays: [], trialDays: 1 };
    if (!valid) set({ startDate: earliest, ...fix });
    else if (!daysOk) set(fix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earliest, selections.startDate, plan?.key, trial?.maxDays, picks.join()]);
  const dayLabel: Record<string, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const onStartDate = (v: string) => {
    if (!v) {
      set({ startDate: "" });
      setStartDateError(null);
      return;
    }
    try {
      if (v < minDate) {
        set({ startDate: "" });
        setStartDateError(
          overlapBound
            ? `You have a plan running through ${formatDateOnly(dayBefore(minDate), { mode: "short" })} — choose a start date after it ends`
            : `Earliest available start date is ${minDate}`,
        );
        return;
      }
      const wk = weekdayKey(parseIsoDateUtc(v));
      if (allowed.includes(wk)) {
        set({ startDate: v });
        setStartDateError(null);
      } else {
        set({ startDate: "" });
        setStartDateError(
          "That day isn't available — choose one of: " + allowed.map((d) => dayLabel[d] ?? d).join(", "),
        );
      }
    } catch {
      /* ignore malformed intermediate input */
    }
  };

  return (
    <div className="space-y-6">
      {currentPlan && overlapBound ? (
        <CurrentPlanHint>
          Your current plan runs through{" "}
          <strong>{formatDateOnly(dayBefore(minDate), { mode: "short" })}</strong>. This renewal can
          start on or after <strong>{formatDateOnly(minDate, { mode: "short" })}</strong>.
          {selections.startDate !== earliest ? (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => { set({ startDate: earliest }); setStartDateError(null); }}
              >
                Renew from {formatDateOnly(earliest, { mode: "short" })}
              </button>
            </>
          ) : null}
        </CurrentPlanHint>
      ) : currentPlan ? (
        <CurrentPlanHint>
          Your current plan starts <strong>{currentPlan.startDate}</strong>. Choose when this new
          subscription should begin.
        </CurrentPlanHint>
      ) : null}
      <div>
        <DateField
          id="wizard-start-date"
          label="Start date"
          value={selections.startDate}
          onChange={onStartDate}
          today={minDate}
          minDate={minDate}
          allowedDays={allowed}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {trial ? "Sent on" : "Deliveries start on a weekday"} ({allowed.map((d) => dayLabel[d] ?? d).join(", ")}); earliest {formatDateOnly(earliest, { mode: "short" })}.
        </p>
        {startDateError && <p className="mt-1 text-xs text-destructive">{startDateError}</p>}
        {sameWeekConflict && !startDateError ? (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-pretty">
            For this week you&apos;re already subscribed on your current plan. You can still continue —
            check overlapping deliveries on Manage if that is not intentional.
          </p>
        ) : null}
      </div>
      {trial ? (multiDay && <TrialLength trial={trial} picks={picks} set={set} />) : (
      <div>
        <p className="text-muted-foreground text-[13px] font-semibold tracking-[0.02em]">Commitment duration</p>
        <ChoiceGroup
          label="Commitment duration"
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          value={String(selections.durationWeeks)}
          onChange={(v) => set({ durationWeeks: Number(v) })}
        >
          {[...catalog.durations].sort((a, b) => b.weeks - a.weeks).map((d) => {
            const save = savings[d.weeks] ?? 0;
            const tint = save > 0 && selections.durationWeeks !== d.weeks
              ? "border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_6%,var(--card))]"
              : "";
            return (
              <Choice key={d.weeks} value={String(d.weeks)} className={`min-h-[72px] p-4 text-sm font-semibold ${tint}`}>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[22px] leading-none font-bold tracking-[-0.03em]">{d.weeks}wk</span>
                  {save > 0 && <Pill tone="save" size="sm" aria-label={`Save ${save}%`}>Save {save}%</Pill>}
                </span>
              </Choice>
            );
          })}
        </ChoiceGroup>
      </div>
      )}
      {schedule && <ScheduleCard trips={schedule.trips} shifted={schedule.shifted} />}
    </div>
  );
}

const H = "text-muted-foreground text-[13px] font-semibold tracking-[0.02em]";

/** The Schedule step's timeline with real dates, one calendar week at a time across the whole plan. */
function ScheduleCard({ trips, shifted }: { trips: DatedTrip[]; shifted: boolean }) {
  const weeks = tripsByWeek(trips);
  const [page, setPage] = useState(0);
  // A new start date or duration reshapes the weeks; go back to the first.
  const shape = `${trips[0]!.dateIso}:${trips.length}`;
  const [seen, setSeen] = useState(shape);
  if (seen !== shape) {
    setSeen(shape);
    setPage(0);
  }
  const i = Math.min(page, weeks.length - 1);
  const w = weeks[i]!;
  const last = i === weeks.length - 1;
  const short = (iso: string) => formatDateOnly(iso, { mode: "short" });
  const navBtn = "border-border hover:bg-muted grid size-8 place-items-center rounded-full border disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <section aria-labelledby="start-preview" className="bg-card border-border rounded-[20px] border p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 id="start-preview" className={H}>How your tiffins arrive</h2>
        <p className="text-sm">
          <strong>{short(trips[0]!.dateIso)}</strong>
          <span className="text-muted-foreground"> to </span>
          <strong>{short(trips.at(-1)!.dateIso)}</strong>
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold" aria-live="polite">
          Week {i + 1} of {weeks.length}
          <span className="text-muted-foreground font-normal"> · {formatMenuWeekRange(w.weekStart)}</span>
        </p>
        {weeks.length > 1 && (
          <div className="flex gap-1.5">
            <button type="button" className={navBtn} disabled={i === 0} onClick={() => setPage(i - 1)} aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className={navBtn} disabled={last} onClick={() => setPage(i + 1)} aria-label="Next week">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
      <TripTimeline trips={w.trips} weekStart={w.weekStart} />
      {last && shifted && weeks.length > 1 && (
        <p className="text-muted-foreground mt-3 text-xs text-pretty">
          Days in your first week before your start date are added here, so you still get every tiffin.
        </p>
      )}
    </section>
  );
}

function TrialLength({
  trial,
  picks,
  set,
}: {
  trial: { maxDays: number; weekdays: string[] };
  picks: string[];
  set: (patch: Partial<WizardSelections>) => void;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[13px] font-semibold tracking-[0.02em]">Trial days</p>
      <div className="mt-3">
        <TrialDayPicker sendDays={trial.weekdays} maxDays={trial.maxDays} picked={picks} onChange={(days) => set({ eatingDays: days, trialDays: days.length })} />
      </div>
    </div>
  );
}
