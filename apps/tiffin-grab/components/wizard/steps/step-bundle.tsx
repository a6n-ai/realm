import { PlusIcon } from "lucide-react";
import { listableMealSizes, type ClientCatalogSnapshot, type ClientMealSizeView } from "@/lib/catalog/types";
import { DEFAULT_EATING_DAYS, type WizardSelections } from "../selections";
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
  trial = null,
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  currentPlan?: CurrentPlanSummary | null;
  /** When set, trial sizes appear in this step. Null hides them (trials are off). */
  trial?: { maxDays: number; weekdays: string[] } | null;
}) {
  const meals = listableMealSizes(catalog.mealSizes, selections.mealSizeId).filter((m) => m.planKey === selections.planKey);
  const weekly = meals.filter((m) => !m.trial);
  const trials = trial ? meals.filter((m) => m.trial) : [];
  const selectedMeal = meals.find((m) => m.publicId === selections.mealSizeId);

  // Only categories an admin explicitly attached add-ons to show up — see
  // dishCategoryAddonCategories. Deduped: two component categories can share
  // the same add-on category.
  const eligibleAddons = (() => {
    if (!selectedMeal || selectedMeal.trial) return [];
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
      {trials.length > 0 && trial && (
        <section>
          <h3 className="mb-3 text-[13px] font-semibold tracking-[0.02em] text-[var(--s-vac-fg,#8a5a00)]">Trial</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {trials.map((m) => (
              <MealOption
                key={m.publicId}
                meal={m}
                active={selections.mealSizeId === m.publicId}
                categoryLabels={catalog.categoryLabels}
                trial
                onPick={() => set({ mealSizeId: m.publicId, trialDays: trial.maxDays, addonSelections: [], eatingDays: [] })}
              />
            ))}
          </div>
        </section>
      )}
      {TIERS.map((tier) => {
        const tierMeals = weekly.filter((m) => m.tier === tier);
        if (tierMeals.length === 0) return null;
        return (
          <section key={tier}>
            <h3 className="text-muted-foreground mb-3 text-[13px] font-semibold tracking-[0.02em] capitalize">{tier}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {tierMeals.map((m) => (
                <MealOption
                  key={m.publicId}
                  meal={m}
                  active={selections.mealSizeId === m.publicId}
                  categoryLabels={catalog.categoryLabels}
                  onPick={() => set({ mealSizeId: m.publicId, trialDays: undefined, ...(selections.trialDays != null ? { eatingDays: DEFAULT_EATING_DAYS } : {}) })}
                />
              ))}
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

function MealOption({
  meal,
  active,
  categoryLabels,
  trial = false,
  onPick,
}: {
  meal: ClientMealSizeView;
  active: boolean;
  categoryLabels?: Record<string, string>;
  trial?: boolean;
  onPick: () => void;
}) {
  return (
    <OptionCard selected={active} tone={trial ? "trial" : undefined} onClick={onPick} className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[17px] leading-snug font-semibold tracking-[-0.02em]">{meal.name}</span>
        <MealSizePrice meal={meal} perTiffin priceClassName={trial ? "text-[17px] font-bold text-[var(--s-vac-fg,#8a5a00)]" : "text-primary text-[17px] font-bold"} />
      </div>
      {trial && <Pill tone="vac" size="sm" className="-mt-1 w-fit">Trial</Pill>}
      {mealOffPct(meal) > 0 && <Pill tone="save" size="sm" className="-mt-1 w-fit">{mealOffPct(meal)}% off</Pill>}
      {meal.description ? <p className="text-muted-foreground -mt-1 text-sm text-pretty">{meal.description}</p> : null}
      <MealSizeItems items={meal.items} categoryLabels={categoryLabels} />
      {active && (
        <div className="flex flex-wrap gap-1">
          {meal.kcalMax > 0 && <Pill tone="soft" size="sm">{meal.kcalMin}–{meal.kcalMax} kcal</Pill>}
          {meal.proteinG != null && <Pill tone="soft" size="sm">P {meal.proteinG}g</Pill>}
          {meal.carbsG != null && <Pill tone="soft" size="sm">C {meal.carbsG}g</Pill>}
          {meal.fatG != null && <Pill tone="soft" size="sm">F {meal.fatG}g</Pill>}
        </div>
      )}
    </OptionCard>
  );
}
