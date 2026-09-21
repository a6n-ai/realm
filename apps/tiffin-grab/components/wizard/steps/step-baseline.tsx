import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { selectablePlans } from "../plan-filter";
import { SelectableCard } from "@/components/customer/kit";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";

export function StepBaseline({
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
              onClick={() => {
                // Dish selection happens per-delivery after subscribing, not here —
                // mealSlots just mirrors the plan's full category set so pricing's
                // "at least one category" guard is satisfied.
                set({ planKey: p.key, mealSizeId: "", mealSlots: p.offeredSlots ?? [] });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
