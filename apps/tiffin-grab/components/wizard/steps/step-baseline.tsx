import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { selectablePlans } from "../plan-filter";
import { Check } from "lucide-react";
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
      <div className="border-t-[1.5px] border-foreground">
        {selectablePlans(catalog).map((p) => {
          const selected = selections.planKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                // Dish selection happens per-delivery after subscribing, not here —
                // mealSlots just mirrors the plan's full category set so pricing's
                // "at least one category" guard is satisfied.
                set({ planKey: p.key as WizardSelections["planKey"], mealSizeId: "", mealSlots: p.offeredSlots ?? [] });
              }}
              className={`hover-lift outline-none focus-visible:ring-3 focus-visible:ring-ring/50 flex w-full flex-wrap items-center justify-between gap-4 border-b-[1.5px] border-foreground px-2 py-6 text-left transition-[padding] hover:pl-6 ${selected ? "bg-primary/5" : ""}`}
            >
              <span className="text-[clamp(22px,3.6vw,34px)] font-bold tracking-[-1px] leading-none">{p.name}</span>
              <span className="flex items-center gap-5">
                <span className="max-w-[320px] text-sm text-muted-foreground">{p.description}</span>
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-base ${selected ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {selected ? <Check className="size-4" /> : "→"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
