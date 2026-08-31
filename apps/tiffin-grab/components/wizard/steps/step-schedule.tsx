import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { isFrequencyDisabled, type WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Label } from "@foundry/ui/label";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";

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
  return (
    <div className="space-y-6">
      {currentPlan ? (
        <CurrentPlanHint>
          Your current plan runs <strong>{currentPlan.daysPerWeek} days/wk</strong>. Set the
          schedule for this new subscription independently.
        </CurrentPlanHint>
      ) : null}
      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Delivery frequency</Label>
        <RadioGroup
          className="mt-3 flex flex-wrap gap-3"
          value={selections.frequencyKey}
          onValueChange={(v) => set({ frequencyKey: v as WizardSelections["frequencyKey"] })}
        >
          {catalog.frequencies.map((f) => {
            const active = selections.frequencyKey === f.key;
            // Shown but not sellable yet. RadioGroupItem carries the real disabled
            // state so the option is skipped by keyboard and announced as disabled —
            // dimming alone would still let a customer arrow onto it and pick it.
            const disabled = isFrequencyDisabled(f.key);
            return (
              <label
                key={f.key}
                htmlFor={f.key}
                title={disabled ? "Not available yet" : undefined}
                className={`border-foreground flex h-[54px] items-center gap-2 rounded-full border-[1.5px] px-6 text-sm font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : ""} ${disabled ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
              >
                <RadioGroupItem id={f.key} value={f.key} disabled={disabled} className={active ? "border-primary-foreground text-primary-foreground" : ""} />
                {f.name}
              </label>
            );
          })}
        </RadioGroup>
      </div>
    </div>
  );
}
