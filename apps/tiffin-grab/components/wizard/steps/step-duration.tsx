import { useState } from "react";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Label } from "@foundry/ui/label";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";
import { BestPill } from "../best-deal";
import { frequencyOrDurationDeal } from "../best-deal-state";
import { savePct } from "@/lib/pricing/discounts";
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

  const dealCmp = frequencyOrDurationDeal(catalog, selections, "duration");
  const winnerWeeks = dealCmp.state === "recommend" ? dealCmp.deal.payload.durationWeeks : dealCmp.state === "applied" ? selections.durationWeeks : null;

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
          Deliveries start on a weekday ({allowed.map((d) => dayLabel[d] ?? d).join(", ")}); earliest {minDate}.
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
        <Label className="text-primary text-[13px] font-semibold tracking-[0.02em]">Commitment duration</Label>
        <RadioGroup
          className="mt-3 flex flex-wrap gap-2.5"
          value={String(selections.durationWeeks)}
          onValueChange={(v) => set({ durationWeeks: Number(v) })}
        >
          {catalog.durations.map((d) => {
            const active = selections.durationWeeks === d.weeks;
            const save = savePct(catalog.discounts, "duration", d.publicId, d.weeks, catalog.maxDiscountPct);
            return (
              <label
                key={d.weeks}
                htmlFor={`d${d.weeks}`}
                className={`border-border flex h-[54px] cursor-pointer items-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : ""}`}
              >
                <RadioGroupItem id={`d${d.weeks}`} value={String(d.weeks)} className={active ? "border-primary-foreground text-primary-foreground" : ""} />
                {d.weeks}wk
                {d.weeks === winnerWeeks
                  ? <BestPill selected={active} onPrimary={active} save={save} />
                  : save > 0 && <span aria-label={`Save ${save}%`} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-primary-foreground/20" : "bg-primary/15 text-primary"}`}>Save {save}%</span>}
              </label>
            );
          })}
        </RadioGroup>
      </div>
    </div>
  );
}
