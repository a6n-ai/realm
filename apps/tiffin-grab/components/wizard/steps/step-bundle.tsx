import { Fragment } from "react";
import { listableMealSizes, type ClientCatalogSnapshot, type ClientMealSizeView } from "@/lib/catalog/types";
import { DEFAULT_EATING_DAYS, offeredAddons, type WizardSelections } from "../selections";
import { AddonsPanel } from "../addons-panel";
import { OptionCard, Pill } from "@/components/customer/kit";
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
  const meals = listableMealSizes(catalog.mealSizes).filter((m) => m.planKey === selections.planKey);
  const weekly = meals.filter((m) => !m.trial);
  const trials = trial ? meals.filter((m) => m.trial) : [];

  // Add-ons on this plan's menu, plus plan-bound ones (see mealSizeAddons).
  const eligibleAddons = offeredAddons(catalog, selections);

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
                  {/* Desktop: right under the meal it extends. Phones get the drawer on Next instead. */}
                  {selections.mealSizeId === m.publicId && eligibleAddons.length > 0 && (
                    <AddonsPanel addons={eligibleAddons} categoryLabels={catalog.categoryLabels} selections={selections} set={set} className="hidden sm:col-span-2 sm:block" />
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
