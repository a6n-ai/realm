import type { ClientCatalogSnapshot, ClientMealSizeView } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Card } from "@foundry/ui/card";
import { Badge } from "@foundry/ui/badge";
import { MealSizeItems } from "../meal-size-items";
import { MealSizePrice } from "../meal-size-price";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";

const TIERS: ClientMealSizeView["tier"][] = ["budget", "medium", "premium"];

export function StepBundle({
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
  const meals = catalog.mealSizes.filter((m) => m.planKey === selections.planKey && !m.trial);

  return (
    <div className="space-y-4">
      {currentPlan ? (
        <CurrentPlanHint>
          You&apos;re on <strong>{currentPlan.planName}</strong> · {currentPlan.mealSizeName} ·{" "}
          {currentPlan.daysPerWeek} days/wk. Choose a meal size for the <strong>new</strong> plan.
        </CurrentPlanHint>
      ) : null}
      {TIERS.map((tier) => {
        const tierMeals = meals.filter((m) => m.tier === tier);
        if (tierMeals.length === 0) return null;
        return (
          <section key={tier}>
            <h3 className="text-primary mb-3 text-xs font-semibold tracking-[2.5px] uppercase">{tier}</h3>
            <div className="grid gap-3.5 sm:grid-cols-2">
              {tierMeals.map((m) => {
                const active = selections.mealSizeId === m.publicId;
                return (
                  <Card
                    key={m.publicId}
                    role="button"
                    onClick={() => set({ mealSizeId: m.publicId })}
                    className={`border-foreground hover-lift cursor-pointer rounded-2xl border-[1.5px] p-4.5 transition-[transform,box-shadow,background-color] active:scale-[0.99] ${active ? "ring-primary ring-2" : "hover:bg-accent"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{m.name}</span>
                      <MealSizePrice meal={m} />
                    </div>
                    {m.description ? <p className="text-muted-foreground mt-1 text-sm text-pretty">{m.description}</p> : null}
                    <div className="border-foreground mt-2 border-t-[1.5px] border-dashed pt-2">
                      <MealSizeItems items={m.items} categoryLabels={catalog.categoryLabels} />
                    </div>
                    {active && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="rounded-full">{m.kcalMin}–{m.kcalMax} kcal</Badge>
                        {m.proteinG != null && <Badge variant="secondary" className="rounded-full">P {m.proteinG}g</Badge>}
                        {m.carbsG != null && <Badge variant="secondary" className="rounded-full">C {m.carbsG}g</Badge>}
                        {m.fatG != null && <Badge variant="secondary" className="rounded-full">F {m.fatG}g</Badge>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
