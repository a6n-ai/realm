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
      <div className="grid gap-3 sm:grid-cols-2">
        {selectablePlans(catalog).map((p) => {
          const selected = selections.planKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                // Dish selection happens per-delivery after subscribing, not here —
                // mealSlots just mirrors the plan's full category set so pricing's
                // "at least one category" guard is satisfied.
                set({ planKey: p.key, mealSizeId: "", mealSlots: p.offeredSlots ?? [] });
              }}
              className={`flex min-h-24 w-full cursor-pointer items-center justify-between gap-4 rounded-[20px] border-2 p-4 text-left outline-none transition-[transform,background-color,border-color] duration-100 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100 ${selected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
            >
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[22px] leading-tight font-bold tracking-[-0.03em]">{p.name}</span>
                <span className="text-muted-foreground text-sm text-pretty">{p.description}</span>
              </span>
              <span
                aria-hidden
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-base ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
              >
                {selected ? <Check className="size-4" /> : "→"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
