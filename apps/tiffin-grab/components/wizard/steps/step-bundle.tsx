import { MinusIcon, PlusIcon } from "lucide-react";
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
    const byKey = new Map<string, { key: string; name: string; pricePerWeek: number; maxQty: number }>();
    for (const item of selectedMeal.items) {
      for (const addon of catalog.addonsByCategory?.[item.category] ?? []) byKey.set(addon.key, addon);
    }
    return [...byKey.values()];
  })();

  const addonSelections = selections.addonSelections ?? [];
  const qtyFor = (key: string) => addonSelections.find((s) => s.key === key)?.qty ?? 0;
  const setQty = (key: string, qty: number) => {
    const rest = addonSelections.filter((s) => s.key !== key);
    set({ addonSelections: qty > 0 ? [...rest, { key, qty }] : rest });
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
          <div className="space-y-2">
            {eligibleAddons.map((addon) => {
              const qty = qtyFor(addon.key);
              const active = qty > 0;
              return (
                <div
                  key={addon.key}
                  className={`border-foreground flex min-h-11 items-center justify-between gap-3 rounded-xl border-[1.5px] px-4 py-2 transition-colors ${active ? "bg-primary/10" : ""}`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{addon.name}</span>
                    <span className="nums text-muted-foreground text-xs">${addon.pricePerWeek.toFixed(2)}/wk each</span>
                  </div>
                  {active ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Remove one ${addon.name}`}
                        onClick={() => setQty(addon.key, qty - 1)}
                        className="border-foreground hover-lift flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-transform active:scale-[0.92]"
                      >
                        <MinusIcon className="size-3.5" />
                      </button>
                      <span className="nums w-6 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
                      <button
                        type="button"
                        aria-label={`Add one more ${addon.name}`}
                        disabled={qty >= addon.maxQty}
                        onClick={() => setQty(addon.key, qty + 1)}
                        className="border-foreground hover-lift flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-transform active:scale-[0.92] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setQty(addon.key, 1)}
                      className="border-foreground hover-lift flex min-h-9 cursor-pointer items-center gap-1 rounded-full border-[1.5px] px-3 py-1.5 text-sm font-medium transition-[transform,box-shadow,background-color] active:scale-[0.96] hover:bg-accent"
                    >
                      <PlusIcon className="size-3.5" /> Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
