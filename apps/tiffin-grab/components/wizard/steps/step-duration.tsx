import { useEffect, useMemo, useState } from "react";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "../selections";
import { Choice, ChoiceGroup, Pill } from "@/components/customer/kit";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";
import { durationSavings } from "@/lib/pricing/recommend";
import { formatDateOnly } from "@/lib/format/datetime";
import { DateField } from "@/components/customer/date-field";
import { earliestTrialIso } from "@/lib/trial/schedule";
import { appToday, firstStartOnOrAfter } from "@/lib/services/start-date";
import { TrialDayPicker } from "../trial-day-picker";
import { plannedSchedule, ScheduleCard } from "../schedule-card";
import { WeeksSlider } from "../weeks-slider";

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
  lastTiffin = null,
  trial = null,
  holidayDates = [],
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  result: PricingResult | null;
  sameWeekConflict?: boolean;
  currentPlan?: CurrentPlanSummary | null;
  minStartDate?: string | null;
  lastTiffin?: string | null;
  /** Set when the chosen size is a trial: day count replaces the week commitment. */
  trial?: { maxDays: number; weekdays: string[] } | null;
  /** Closed days (YYYY-MM-DD) the start date cannot be. */
  holidayDates?: string[];
}) {
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const plan = catalog.plans.find((p) => p.key === selections.planKey);
  // A multi-day trial picks its days; a one-day trial just picks a start date on a send day.
  const multiDay = !!trial && trial.maxDays > 1;
  const picks = multiDay ? (selections.eatingDays ?? []).filter((d) => trial.weekdays.includes(d)) : [];
  const freq = catalog.frequencies.find((f) => f.key === selections.frequencyKey);
  // A weekly plan starts on one of its delivery days: starting Thu on Mon/Wed/Fri would first deliver Fri.
  const startDays = plan?.allowedStartDays ?? ["mon", "tue", "wed", "thu", "fri"];
  const onDelivery = startDays.filter((d) => freq?.weekdays?.includes(d as never));
  const allowed = trial ? (picks.length ? picks : trial.weekdays) : onDelivery.length ? onDelivery : startDays;
  const today = appToday(catalog.timezone, catalog.cutoffHour);
  const tomorrow = trial ? earliestTrialIso(today, trial.weekdays) : nextWeekday(today).toISOString().slice(0, 10);
  const closed = useMemo(() => new Set(holidayDates), [holidayDates]);
  const minDate = minStartDate && minStartDate > tomorrow ? minStartDate : tomorrow;
  const overlapBound = minStartDate != null && minDate === minStartDate;
  // The day the customer reads as "my plan ends": the real last tiffin when known.
  const runsThrough = lastTiffin ?? (minStartDate ? dayBefore(minStartDate) : null);
  // First day on/after minDate that the plan actually delivers on.
  const earliest = firstStartOnOrAfter(minDate, allowed, closed);
  const schedule = plannedSchedule(
    trial
      ? { kind: "trial", startDate: selections.startDate, picks: multiDay ? picks : selections.startDate ? [weekdayKey(parseIsoDateUtc(selections.startDate))] : [] }
      : { kind: "weekly", startDate: selections.startDate, durationWeeks: selections.durationWeeks, frequency: freq, eatingDays: selections.eatingDays ?? [] },
  );
  const savings = useMemo(() => durationSavings(catalog, selections), [catalog, selections]);
  // Pre-select the earliest selectable date; a stale or now-invalid pick is replaced too.
  useEffect(() => {
    const cur = selections.startDate;
    const valid = cur && cur >= minDate && allowed.includes(weekdayKey(parseIsoDateUtc(cur))) && !closed.has(cur);
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
  }, [earliest, closed, selections.startDate, plan?.key, trial?.maxDays, picks.join()]);
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
            ? `Current plan ends ${formatDateOnly(runsThrough!, { mode: "short" })}. Pick a later date`
            : `Earliest available start date is ${minDate}`,
        );
        return;
      }
      if (closed.has(v)) {
        set({ startDate: "" });
        setStartDateError("We are closed that day. Pick another start date");
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
          Current plan ends <strong>{formatDateOnly(runsThrough!, { mode: "short" })}</strong>.
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
          closedDates={holidayDates}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {trial ? "Sent " : ""}
          {allowed.join() === "mon,tue,wed,thu,fri" ? "Weekdays only" : allowed.map((d) => dayLabel[d] ?? d).join(", ")} · earliest {formatDateOnly(earliest, { mode: "short" })}
        </p>
        {startDateError && <p className="mt-1 text-xs text-destructive">{startDateError}</p>}
        {sameWeekConflict && !startDateError ? (
          <p className="mt-2 rounded-2xl bg-warn/10 px-3 py-2 text-xs text-pretty">
            For this week you&apos;re already subscribed on your current plan. You can still continue —
            check overlapping deliveries on Manage if that is not intentional.
          </p>
        ) : null}
      </div>
      {trial ? (multiDay && <TrialLength trial={trial} picks={picks} set={set} />) : (
      <div>
        <p className="text-muted-foreground text-[13px] font-semibold tracking-[0.02em]">Commitment duration</p>
        <div className="mt-3">
          <WeeksSlider
            weeks={catalog.durations.map((d) => d.weeks)}
            value={selections.durationWeeks}
            savings={savings}
            perWeek={selections.eatingDays?.length || freq?.daysPerWeek}
            onChange={(w) => set({ durationWeeks: w })}
          />
        </div>
      </div>
      )}
      {schedule && <ScheduleCard trips={schedule.trips} shifted={schedule.shifted} />}
    </div>
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
