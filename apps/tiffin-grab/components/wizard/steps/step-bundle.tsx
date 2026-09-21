import { PlusIcon } from "lucide-react";
import type { ClientCatalogSnapshot, ClientMealSizeView } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Button, OptionCard, Pill, Stepper } from "@/components/customer/kit";
import { MealSizeItems } from "../meal-size-items";
import { mealOffPct } from "../best-deal-state";
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
          {currentPlan.daysPerWeek} delivery days/wk. Choose a meal size for the <strong>new</strong> plan.
        </CurrentPlanHint>
      ) : null}
      {TIERS.map((tier) => {
        const tierMeals = meals.filter((m) => m.tier === tier);
        if (tierMeals.length === 0) return null;
        return (
          <section key={tier}>
            <h3 className="text-muted-foreground mb-3 text-[13px] font-semibold tracking-[0.02em] capitalize">{tier}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {tierMeals.map((m) => {
                const active = selections.mealSizeId === m.publicId;
                return (
                  <OptionCard
                    key={m.publicId}
                    selected={active}
                    onClick={() => set({ mealSizeId: m.publicId })}
                    className="flex min-w-0 flex-col gap-3 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[17px] leading-snug font-semibold tracking-[-0.02em]">{m.name}</span>
                      <MealSizePrice meal={m} perTiffin priceClassName="text-primary text-[17px] font-bold" />
                    </div>
                    {mealOffPct(m) > 0 && <Pill tone="save" size="sm" className="-mt-1 w-fit">{mealOffPct(m)}% off</Pill>}
                    {m.description ? <p className="text-muted-foreground -mt-1 text-sm text-pretty">{m.description}</p> : null}
                    <MealSizeItems items={m.items} categoryLabels={catalog.categoryLabels} />
                    {active && (
                      <div className="flex flex-wrap gap-1">
                        <Pill tone="soft" size="sm">{m.kcalMin}–{m.kcalMax} kcal</Pill>
                        {m.proteinG != null && <Pill tone="soft" size="sm">P {m.proteinG}g</Pill>}
                        {m.carbsG != null && <Pill tone="soft" size="sm">C {m.carbsG}g</Pill>}
                        {m.fatG != null && <Pill tone="soft" size="sm">F {m.fatG}g</Pill>}
                      </div>
                    )}
                  </OptionCard>
                );
              })}
            </div>
          </section>
        );
      })}

      {eligibleAddons.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-3 text-[13px] font-semibold tracking-[0.02em]">Add-ons</h3>
          <div className="space-y-2">
            {eligibleAddons.map((addon) => {
              const qty = qtyFor(addon.key);
              const active = qty > 0;
              return (
                <div
                  key={addon.key}
                  className={`border-border flex min-h-11 items-center justify-between gap-3 rounded-xl border px-4 py-2 transition-colors ${active ? "bg-primary/10" : ""}`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{addon.name}</span>
                    <span className="nums text-muted-foreground text-xs">${addon.pricePerWeek.toFixed(2)}/wk each</span>
                  </div>
                  {active ? (
                    <Stepper label={addon.name} value={qty} min={0} max={addon.maxQty} onChange={(n) => setQty(addon.key, n)} />
                  ) : (
                    <Button variant="quiet" pill className="gap-1 !px-4 py-1.5 text-sm font-medium" onClick={() => setQty(addon.key, 1)}>
                      <PlusIcon aria-hidden className="size-3.5" /> Add
                    </Button>
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
