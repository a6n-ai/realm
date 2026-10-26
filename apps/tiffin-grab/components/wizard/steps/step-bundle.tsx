import { Fragment } from "react";
import { listableMealSizes, type ClientCatalogSnapshot, type ClientMealSizeView } from "@/lib/catalog/types";
import { DEFAULT_EATING_DAYS, offeredAddons, type WizardSelections } from "../selections";
import { AddonsPanel } from "../addons-panel";
import { Gift } from "lucide-react";
import { IconTile, OptionCard, Pill } from "@/components/customer/kit";
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
  popular = [],
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  currentPlan?: CurrentPlanSummary | null;
  /** When set, trial sizes appear in this step. Null hides them (trials are off). */
  trial?: { maxDays: number; weekdays: string[] } | null;
  /** Most-ordered meal size ids; the ones on this plan go first, side by side, and leave the tier lists. */
  popular?: string[];
}) {
  const meals = listableMealSizes(catalog.mealSizes).filter((m) => m.planKey === selections.planKey);
  const top = popular.map((id) => meals.find((m) => m.publicId === id && !m.trial)).filter((m): m is ClientMealSizeView => !!m).slice(0, 2);
  const weekly = meals.filter((m) => !m.trial && !top.includes(m));
  const pick = (m: ClientMealSizeView) => set({
    mealSizeId: m.publicId,
    trialDays: undefined,
    // Another meal may not offer the same add-ons; the server would refuse a stale one.
    ...(m.publicId !== selections.mealSizeId ? { addonSelections: [] } : {}),
    ...(selections.trialDays != null ? { eatingDays: DEFAULT_EATING_DAYS } : {}),
  });
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
      {top.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-3 text-[13px] font-semibold tracking-[0.02em]">Most popular</h3>
          {/* Two across at every width: the pick most people make, before the full list. */}
          <div className={top.length > 1 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
            {top.map((m) => <PopularOption key={m.publicId} meal={m} active={selections.mealSizeId === m.publicId} onPick={() => pick(m)} />)}
            {top.some((m) => m.publicId === selections.mealSizeId) && eligibleAddons.length > 0 && (
              <AddonsPanel addons={eligibleAddons} categoryLabels={catalog.categoryLabels} selections={selections} set={set} className="col-span-2 hidden sm:block" />
            )}
          </div>
        </section>
      )}
      {trials.length > 0 && trial && (
        <section>
          <h3 className="mb-3 text-[13px] font-semibold tracking-[0.02em] text-[var(--muted-foreground)]">New here? Try a tiffin first</h3>
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
                    onPick={() => pick(m)}
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

/** Compact card for the Most popular row: name, kcal and price, sized for half a phone's width. */
function PopularOption({ meal, active, onPick }: { meal: ClientMealSizeView; active: boolean; onPick: () => void }) {
  return (
    <OptionCard selected={active} onClick={onPick} className="flex min-w-0 flex-col gap-2 p-3.5">
      <Pill tone="brand" size="sm" className="w-fit">Popular</Pill>
      <span className="text-[17px] leading-tight font-semibold tracking-[-0.02em] text-balance">{meal.name}</span>
      {meal.kcalMax > 0 && <Pill tone="soft" size="sm" className="w-fit">{meal.kcalMin}–{meal.kcalMax} kcal</Pill>}
      <span className="mt-auto pt-1">
        <MealSizePrice meal={meal} perTiffin priceClassName="text-primary text-[22px] font-bold tracking-[-0.03em]" />
      </span>
    </OptionCard>
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
  // A trial is a feature card of its own: brand-tinted, a gift tile and "Try first", so it reads as an offer
  // rather than one more size in the grid. Selected it gets the same ring as every option.
  if (trial) {
    return (
      <OptionCard selected={active} onClick={onPick} className="flex min-w-0 gap-3 bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] p-4">
        <IconTile tint="orange" size="lg"><Gift /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <Pill tone="brand" size="sm" className="mb-1 w-fit">Try first</Pill>
              <span className="block text-[20px] leading-tight font-semibold tracking-[-0.025em]">{meal.name}</span>
            </span>
            <MealSizePrice meal={meal} perTiffin stacked priceClassName="text-primary text-[24px] font-bold tracking-[-0.03em]" />
          </div>
          <p className="text-muted-foreground text-sm text-pretty">{meal.description || "Taste it before you commit to a plan."}</p>
          <MealSizeItems items={meal.items} categoryLabels={categoryLabels} />
        </div>
      </OptionCard>
    );
  }
  return (
    <OptionCard selected={active} onClick={onPick} className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[20px] leading-tight font-semibold tracking-[-0.025em]">{meal.name}</span>
          {/* Shown on every card beside the name, so picking one never makes it taller. */}
          {meal.kcalMax > 0 && <Pill tone="soft" size="sm">{meal.kcalMin}–{meal.kcalMax} kcal</Pill>}
        </span>
        <MealSizePrice meal={meal} perTiffin stacked priceClassName="text-primary text-[24px] font-bold tracking-[-0.03em]" />
      </div>
      {mealOffPct(meal) > 0 && <Pill tone="save" size="sm" className="-mt-1 w-fit">{mealOffPct(meal)}% off</Pill>}
      {meal.description ? <p className="text-muted-foreground -mt-1 text-sm text-pretty">{meal.description}</p> : null}
      <MealSizeItems items={meal.items} categoryLabels={categoryLabels} />
    </OptionCard>
  );
}
