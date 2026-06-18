import { useState } from "react";
import type { CatalogSnapshot, MealSizeView } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type DietTab = "all" | "veg" | "nonveg";

const visibleFor = (plan: WizardSelections["planKey"], diet: DietTab) => (m: MealSizeView) => {
  if (plan === "veg" && m.diet === "nonveg") return false;
  if (diet === "veg") return m.diet === "veg" || m.diet === "both";
  if (diet === "nonveg") return m.diet === "nonveg" || m.diet === "both";
  return true;
};

const TIERS: MealSizeView["tier"][] = ["budget", "medium", "premium"];

export function StepBundle({ catalog, selections, set }: {
  catalog: CatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  const [diet, setDiet] = useState<DietTab>("all");
  const meals = catalog.mealSizes.filter(visibleFor(selections.planKey, diet));

  return (
    <div className="space-y-4">
      <Tabs value={diet} onValueChange={(v) => setDiet(v as DietTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="veg">Veg</TabsTrigger>
          <TabsTrigger value="nonveg">Non-Veg</TabsTrigger>
        </TabsList>
      </Tabs>

      {TIERS.map((tier) => {
        const tierMeals = meals.filter((m) => m.tier === tier);
        if (tierMeals.length === 0) return null;
        return (
          <section key={tier}>
            <h3 className="mb-2 text-sm font-semibold capitalize text-muted-foreground">{tier}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {tierMeals.map((m) => {
                const active = selections.mealSizeId === m.id;
                return (
                  <Card
                    key={m.id}
                    role="button"
                    onClick={() => set({ mealSizeId: m.id })}
                    className={`cursor-pointer p-4 transition ${active ? "ring-2 ring-primary" : "hover:bg-accent"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-sm">${m.basePrice.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{m.components.join(", ")}</div>
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
