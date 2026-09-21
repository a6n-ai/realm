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
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  result: PricingResult | null;
  sameWeekConflict?: boolean;
  currentPlan?: CurrentPlanSummary | null;
  minStartDate?: string | null;
}) {
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const plan = catalog.plans.find((p) => p.key === selections.planKey);
  const allowed = plan?.allowedStartDays ?? ["mon", "tue", "wed", "thu", "fri"];
  const tomorrow = nextWeekday(new Date()).toISOString().slice(0, 10);
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
  const savings = useMemo(() => durationSavings(catalog, selections), [catalog, selections]);
  // Pre-select the earliest selectable date; a stale or now-invalid pick is replaced too.
  useEffect(() => {
    const cur = selections.startDate;
    const valid = cur && cur >= minDate && allowed.includes(weekdayKey(parseIsoDateUtc(cur)));
    if (!valid) set({ startDate: earliest });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earliest, selections.startDate, plan?.key]);
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
          Deliveries start on a weekday ({allowed.map((d) => dayLabel[d] ?? d).join(", ")}); earliest {formatDateOnly(earliest, { mode: "short" })}.
        </p>
        {startDateError && <p className="mt-1 text-xs text-destructive">{startDateError}</p>}
        {sameWeekConflict && !startDateError ? (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-pretty">
            For this week you&apos;re already subscribed on your current plan. You can still continue —
            check overlapping deliveries on Manage if that is not intentional.
          </p>
        ) : null}
      </div>
      <div>
        <p className="text-muted-foreground text-[13px] font-semibold tracking-[0.02em]">Commitment duration</p>
        <ChoiceGroup
          label="Commitment duration"
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          value={String(selections.durationWeeks)}
          onChange={(v) => set({ durationWeeks: Number(v) })}
        >
          {catalog.durations.map((d) => {
            const save = savings[d.weeks] ?? 0;
            return (
              <Choice key={d.weeks} value={String(d.weeks)} className="min-h-[72px] p-4 text-sm font-semibold">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[22px] leading-none font-bold tracking-[-0.03em]">{d.weeks}wk</span>
                  {save > 0 && <Pill tone="save" size="sm" aria-label={`Save ${save}%`}>Save {save}%</Pill>}
                </span>
              </Choice>
            );
          })}
        </ChoiceGroup>
      </div>
    </div>
  );
}
