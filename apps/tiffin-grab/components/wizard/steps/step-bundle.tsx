import type { ClientCatalogSnapshot, ClientMealSizeView } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Card } from "@realm/ui/card";
import { Badge } from "@realm/ui/badge";
import { MealSizeItems } from "../meal-size-items";

const TIERS: ClientMealSizeView["tier"][] = ["budget", "medium", "premium"];

export function StepBundle({ catalog, selections, set }: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  const meals = catalog.mealSizes.filter((m) => m.planKey === selections.planKey && !m.trial);

  return (
    <div className="space-y-4">
      {TIERS.map((tier) => {
        const tierMeals = meals.filter((m) => m.tier === tier);
        if (tierMeals.length === 0) return null;
        return (
          <section key={tier}>
            <h3 className="mb-2 text-sm font-semibold capitalize text-muted-foreground">{tier}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {tierMeals.map((m) => {
                const active = selections.mealSizeId === m.publicId;
                return (
                  <Card
                    key={m.publicId}
                    role="button"
                    onClick={() => set({ mealSizeId: m.publicId })}
                    className={`cursor-pointer p-4 transition ${active ? "ring-2 ring-primary" : "hover:bg-accent"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-sm">${m.basePrice.toFixed(2)}</span>
                    </div>
                    <div className="mt-1"><MealSizeItems items={m.items} /></div>
                    {active && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Badge variant="secondary">{m.kcalMin}–{m.kcalMax} kcal</Badge>
                        {m.proteinG != null && <Badge variant="secondary">P {m.proteinG}g</Badge>}
                        {m.carbsG != null && <Badge variant="secondary">C {m.carbsG}g</Badge>}
                        {m.fatG != null && <Badge variant="secondary">F {m.fatG}g</Badge>}
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
