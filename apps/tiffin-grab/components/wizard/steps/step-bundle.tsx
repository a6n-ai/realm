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
  const selectedMeal = meals.find((m) => m.publicId === selections.mealSizeId);

  // Only categories an admin explicitly attached add-ons to show up — see
  // dishCategoryAddonCategories. Deduped: two component categories can share
  // the same add-on category.
  const eligibleAddons = (() => {
    if (!selectedMeal) return [];
    const byKey = new Map<string, { key: string; name: string; pricePerWeek: number }>();
    for (const item of selectedMeal.items) {
      for (const addon of catalog.addonsByCategory?.[item.category] ?? []) byKey.set(addon.key, addon);
    }
    return [...byKey.values()];
  })();

  const addonKeys = selections.addonKeys ?? [];
  const toggleAddon = (key: string) => {
    set({ addonKeys: addonKeys.includes(key) ? addonKeys.filter((k) => k !== key) : [...addonKeys, key] });
  };

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

      {eligibleAddons.length > 0 && (
        <section>
          <h3 className="text-primary mb-3 text-xs font-semibold tracking-[2.5px] uppercase">Add-ons</h3>
          <div className="flex flex-wrap gap-2.5">
            {eligibleAddons.map((addon) => {
              const checked = addonKeys.includes(addon.key);
              return (
                <button
                  key={addon.key}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleAddon(addon.key)}
                  className={`border-foreground hover-lift flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4 py-2 text-sm font-medium transition-[transform,box-shadow,background-color] active:scale-[0.97] ${checked ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  <span>{addon.name}</span>
                  <span className="nums text-xs opacity-80">+${addon.pricePerWeek.toFixed(2)}/wk</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
