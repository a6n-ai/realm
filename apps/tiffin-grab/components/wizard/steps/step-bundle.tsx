import { Fragment } from "react";
import { PlusIcon } from "lucide-react";
import { listableMealSizes, mealSizeAddons, type CatalogAddon, type ClientCatalogSnapshot, type ClientMealSizeView } from "@/lib/catalog/types";
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

  // Add-ons offered with any of this meal size's dish categories (addons.category).
  const eligibleAddons = !selectedMeal || selectedMeal.trial ? [] : mealSizeAddons(catalog.addonsByCategory, selectedMeal.items);

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
                <Fragment key={m.publicId}>
                  <MealOption
                    meal={m}
                    active={selections.mealSizeId === m.publicId}
                    categoryLabels={catalog.categoryLabels}
                    onPick={() => set({
                      mealSizeId: m.publicId,
                      trialDays: undefined,
                      // Another meal may not offer the same add-ons; the server would refuse a stale one.
                      ...(m.publicId !== selections.mealSizeId ? { addonSelections: [] } : {}),
                      ...(selections.trialDays != null ? { eatingDays: DEFAULT_EATING_DAYS } : {}),
                    })}
                  />
                  {/* Right under the meal it extends, so it's seen the moment a meal is picked. */}
                  {selections.mealSizeId === m.publicId && eligibleAddons.length > 0 && (
                    <AddonsPanel addons={eligibleAddons} qtyFor={qtyFor} setQty={setQty} />
                  )}
                </Fragment>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AddonsPanel({
  addons,
  qtyFor,
  setQty,
}: {
  addons: CatalogAddon[];
  qtyFor: (key: string) => number;
  setQty: (key: string, qty: number) => void;
}) {
  return (
    <section aria-label="Add-ons" className="bg-card border-border rounded-2xl border p-4 sm:col-span-2">
      <h4 className="text-[15px] font-semibold tracking-[-0.01em]">Add to every tiffin</h4>
      <p className="text-muted-foreground mt-0.5 text-[13px]">Optional extras, billed per tiffin.</p>
      <ul className="mt-3 space-y-2">
        {addons.map((addon) => {
          const qty = qtyFor(addon.key);
          const active = qty > 0;
          return (
            <li
              key={addon.key}
              className={`border-border flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-2 transition-colors ${active ? "border-primary/40 bg-primary/10" : ""}`}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-medium">{addon.name}</span>
                <span className="nums text-muted-foreground text-[13px]">+${addon.pricePerTiffin.toFixed(2)} per tiffin</span>
              </div>
              {active ? (
                <Stepper label={addon.name} value={qty} min={0} max={addon.maxQty} onChange={(n) => setQty(addon.key, n)} />
              ) : (
                <Button variant="quiet" pill className="min-h-11 shrink-0 gap-1 !px-4 text-sm font-medium" aria-label={`Add ${addon.name}`} onClick={() => setQty(addon.key, 1)}>
                  <PlusIcon aria-hidden className="size-4" /> Add
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
