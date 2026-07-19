import { useState } from "react";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@realm/commons";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@realm/ui/radio-group";
import { Label } from "@realm/ui/label";
import { Input } from "@realm/ui/input";
import { Invoice } from "../invoice";

export function StepDuration({
  catalog,
  selections,
  set,
  result,
  sameWeekConflict = false,
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  result: PricingResult | null;
  sameWeekConflict?: boolean;
}) {
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const plan = catalog.plans.find((p) => p.key === selections.planKey);
  const allowed = plan?.allowedStartDays ?? ["mon", "tue", "wed", "thu", "fri"];
  const minDate = nextWeekday(new Date()).toISOString().slice(0, 10);
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
      <div>
        <Label className="text-sm font-medium">Start date</Label>
        <Input
          type="date"
          className="mt-2 w-full max-w-xs"
          min={minDate}
          value={selections.startDate}
          onChange={(e) => onStartDate(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Deliveries start on a weekday ({allowed.map((d) => dayLabel[d] ?? d).join(", ")}); earliest {minDate}.
        </p>
        {startDateError && <p className="mt-1 text-xs text-destructive">{startDateError}</p>}
        {sameWeekConflict && !startDateError ? (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-pretty">
            This start date falls in the same week as one of your current plans. You can continue, but
            check overlapping deliveries on Manage if that is not intentional.
          </p>
        ) : null}
      </div>
      <div>
        <Label className="text-sm font-medium">Commitment duration</Label>
        <RadioGroup
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
          value={String(selections.durationWeeks)}
          onValueChange={(v) => set({ durationWeeks: Number(v) })}
        >
          {catalog.durations.map((d) => (
            <div key={d.weeks} className="flex items-center gap-2 rounded-md border p-3">
              <RadioGroupItem id={`d${d.weeks}`} value={String(d.weeks)} />
              <Label htmlFor={`d${d.weeks}`}>{d.weeks}wk</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <Invoice result={result} />
    </div>
  );
}
