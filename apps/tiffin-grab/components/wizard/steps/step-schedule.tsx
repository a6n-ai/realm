import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@realm/ui/radio-group";
import { Label } from "@realm/ui/label";
import { Button } from "@realm/ui/button";
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
            return (
              <label
                key={f.key}
                htmlFor={f.key}
                className={`border-foreground flex h-[54px] cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-6 text-[14.5px] font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : ""}`}
              >
                <RadioGroupItem id={f.key} value={f.key} className={active ? "border-primary-foreground text-primary-foreground" : ""} />
                {f.name}
              </label>
            );
          })}
        </RadioGroup>
      </div>

      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Persons (1–5)</Label>
        <div className="mt-3 flex items-center gap-5.5">
          <Button type="button" variant="outline" size="icon" className="border-foreground h-[54px] w-[54px] rounded-full border-[1.5px] text-xl" onClick={() => set({ persons: Math.max(1, selections.persons - 1) })}>−</Button>
          <span className="nums min-w-13 text-center text-[clamp(40px,6vw,60px)] font-bold tracking-[-2px]">{selections.persons}</span>
          <Button type="button" variant="outline" size="icon" className="border-foreground h-[54px] w-[54px] rounded-full border-[1.5px] text-xl" onClick={() => set({ persons: Math.min(5, selections.persons + 1) })}>+</Button>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Weekend delivery</Label>
        <div className="flex flex-wrap gap-3">
          <label className={`border-foreground flex h-[54px] cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-6 text-[14.5px] font-semibold transition-colors ${selections.includeSaturday ? "bg-primary text-primary-foreground" : ""}`}>
            <input type="checkbox" className="sr-only" checked={selections.includeSaturday} onChange={(e) => set({ includeSaturday: e.target.checked })} />
            {selections.includeSaturday ? "✓" : ""} Saturday
          </label>
          <label className={`border-foreground flex h-[54px] cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-6 text-[14.5px] font-semibold transition-colors ${selections.includeSunday ? "bg-primary text-primary-foreground" : ""}`}>
            <input type="checkbox" className="sr-only" checked={selections.includeSunday} onChange={(e) => set({ includeSunday: e.target.checked })} />
            {selections.includeSunday ? "✓" : ""} Sunday
          </label>
        </div>
      </div>
    </div>
  );
}
