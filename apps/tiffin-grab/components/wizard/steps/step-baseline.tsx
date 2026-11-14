import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "@/lib/wizard/selections";
import { selectablePlans } from "../plan-filter";
import { ChoiceGroup, SegmentOption, SelectableCard } from "@/components/kit";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";

export function StepBaseline({
  catalog,
  selections,
  set,
  currentPlan = null,
  compact = false,
}: {
  /** One line of diet pills above the meal sizes (the 2-page wizard), instead of a card per plan. */
  compact?: boolean;
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  currentPlan?: CurrentPlanSummary | null;
}) {
  const pick = (key: string) => {
    const p = selectablePlans(catalog).find((x) => x.key === key);
    // Dish selection happens per-delivery after subscribing, not here: mealSlots just mirrors the plan's full
    // category set so pricing's "at least one category" guard is satisfied.
    if (p && p.key !== selections.planKey) set({ planKey: p.key, mealSizeId: "", mealSlots: p.offeredSlots ?? [] });
  };
  if (compact) {
    const plans = selectablePlans(catalog);
    const chosen = plans.find((p) => p.key === selections.planKey);
    return (
      <div className="flex flex-col gap-2">
        {/* A choice, not tabs: the kit's segmented radio group (arrow keys, roving tab stop). */}
        <ChoiceGroup label="Diet" value={selections.planKey ?? ""} onChange={pick} className="c-seg w-full">
          {plans.map((p) => <SegmentOption key={p.key} value={p.key}>{p.name.replace(/\s*plan$/i, "")}</SegmentOption>)}
        </ChoiceGroup>
        {chosen?.description ? <p className="text-footnote text-muted-foreground">{chosen.description}</p> : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {currentPlan ? (
        <CurrentPlanHint>
          Your current plan is <strong>{currentPlan.planName}</strong>. Starting another is fine —
          pick a plan for the new subscription.
        </CurrentPlanHint>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {selectablePlans(catalog).map((p) => {
          const selected = selections.planKey === p.key;
          return (
            <SelectableCard
              key={p.key}
              selected={selected}
              title={p.name}
              description={p.description}
              indicator
              onClick={() => pick(p.key)}
            />
          );
        })}
      </div>
    </div>
  );
}
