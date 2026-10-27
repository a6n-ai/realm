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
import { dayAllowed, frequencyFits, onlyOnMessage, type DayOfWeek } from "@/lib/menu/delivery-days";
import { effectivePrice } from "@/lib/pricing";

const TIERS: ClientMealSizeView["tier"][] = ["budget", "medium", "premium"];
// Price level instead of a word: "Budget" read as cheap. Screen readers still hear the level.
const TIER_MARK: Record<ClientMealSizeView["tier"], { mark: string; label: string }> = {
  budget: { mark: "$", label: "Lower price" },
  medium: { mark: "$$", label: "Mid price" },
  premium: { mark: "$$$", label: "Higher price" },
};

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
  /** This plan's most-ordered meal size ids; they go first, side by side, and leave the tier lists. */
  popular?: string[];
}) {
  const meals = listableMealSizes(catalog.mealSizes).filter((m) => m.planKey === selections.planKey);
  const ordered = meals.filter((m) => !m.trial);
  const ranked = popular.map((id) => ordered.find((m) => m.publicId === id)).filter((m): m is ClientMealSizeView => !!m);
  // Always two: a plan with fewer ordered sizes is topped up from the catalog's own order.
  const top = [...ranked, ...ordered.filter((m) => !ranked.includes(m))].slice(0, Math.min(2, ordered.length));
  const weekly = meals.filter((m) => !m.trial && !top.includes(m));
  const pick = (m: ClientMealSizeView) => {
    const days = selections.trialDays != null ? DEFAULT_EATING_DAYS : (selections.eatingDays ?? DEFAULT_EATING_DAYS);
    // A size made only on some days keeps only those eating days, and drops a frequency that delivers off them.
    const eatingDays = days.filter((d) => dayAllowed(d, m.allowedDays));
    const freq = catalog.frequencies.find((f) => f.key === selections.frequencyKey);
    set({
      mealSizeId: m.publicId,
      trialDays: undefined,
      // Another meal may not offer the same add-ons; the server would refuse a stale one.
      ...(m.publicId !== selections.mealSizeId ? { addonSelections: [] } : {}),
      eatingDays,
      includeSaturday: eatingDays.includes("sat"),
      includeSunday: eatingDays.includes("sun"),
      ...(freq && !frequencyFits(freq.weekdays as DayOfWeek[] | null, m.allowedDays) ? { frequencyKey: "" } : {}),
    });
  };
  const trials = trial ? meals.filter((m) => m.trial) : [];

  // Add-ons on this plan's menu, plus plan-bound ones (see mealSizeAddons).
  const eligibleAddons = offeredAddons(catalog, selections);

  return (
    <div className="space-y-4">
      {currentPlan ? (
        <CurrentPlanHint>
          Now on {currentPlan.mealSizeName}, {currentPlan.daysPerWeek} days a week.
        </CurrentPlanHint>
      ) : null}
      {top.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-3 text-[13px] font-semibold tracking-[0.02em]">Most popular</h3>
          {/* Two across at every width: the pick most people make, before the full list. */}
          <div className={top.length > 1 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
            {top.map((m) => <PopularOption key={m.publicId} meal={m} categoryLabels={catalog.categoryLabels} active={selections.mealSizeId === m.publicId} onPick={() => pick(m)} />)}
            {top.some((m) => m.publicId === selections.mealSizeId) && eligibleAddons.length > 0 && (
              <AddonsPanel addons={eligibleAddons} categoryLabels={catalog.categoryLabels} categoryIcons={catalog.categoryIcons} selections={selections} set={set} className="col-span-2 hidden sm:block" />
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
      {/* No tier headings: every size in one grid, cheapest tier first; each card carries its $ / $$ / $$$ mark. */}
      {weekly.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...weekly].sort((x, y) => TIERS.indexOf(x.tier) - TIERS.indexOf(y.tier)).map((m) => (
            <Fragment key={m.publicId}>
              <MealOption
                meal={m}
                active={selections.mealSizeId === m.publicId}
                categoryLabels={catalog.categoryLabels}
                onPick={() => pick(m)}
              />
              {/* Desktop: right under the meal it extends. Phones get the drawer on Next instead. */}
              {selections.mealSizeId === m.publicId && eligibleAddons.length > 0 && (
                <AddonsPanel addons={eligibleAddons} categoryLabels={catalog.categoryLabels} categoryIcons={catalog.categoryIcons} selections={selections} set={set} className="hidden sm:col-span-2 sm:block" />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

const DAY_SHORT: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** The days a size is made on, as pills (e.g. non-veg only: Mon, Wed, Fri). Nothing for a size made every day. */
function MealDays({ meal, className = "" }: { meal: ClientMealSizeView; className?: string }) {
  const days = meal.allowedDays;
  if (!days?.length) return null;
  return (
    <span role="note" aria-label={`${onlyOnMessage(days)}.`} className={`flex flex-wrap items-center gap-1 ${className}`}>
      {(Object.keys(DAY_SHORT) as DayOfWeek[]).filter((d) => days.includes(d)).map((d) => (
        <Pill key={d} tone="wash" size="sm">{DAY_SHORT[d]}</Pill>
      ))}
    </span>
  );
}

/** Compact card for the Most popular row: name, kcal and price, sized for half a phone's width. */
/** The size's price level as $ / $$ / $$$, on the card itself. */
function TierMark({ meal }: { meal: ClientMealSizeView }) {
  const t = TIER_MARK[meal.tier];
  // Bottom-right corner of the card, clear of the price above it.
  return (
    <span aria-label={t.label} className="text-muted-foreground absolute right-4 bottom-3 text-[13px] font-bold tracking-[0.08em]">
      {t.mark}
    </span>
  );
}

/** What a screen reader hears for a meal card: the name and its per-tiffin price, not just "pressed". */
const cardLabel = (meal: ClientMealSizeView) =>
  `${meal.name}, $${(meal.discountType === "none" ? meal.basePrice : effectivePrice(meal.basePrice, meal)).toFixed(2)} per tiffin`;

function PopularOption({ meal, active, categoryLabels, onPick }: { meal: ClientMealSizeView; active: boolean; categoryLabels?: Record<string, string>; onPick: () => void }) {
  return (
    <OptionCard badge selected={active} onClick={onPick} aria-label={cardLabel(meal)} className="flex min-w-0 flex-col gap-2 p-3.5 sm:p-4 sm:pb-9">
      <Pill tone="brand" size="sm" className="w-fit">Popular</Pill>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-[17px] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[20px] sm:tracking-[-0.025em]">{meal.name}</span>
          <span className="flex flex-wrap items-center gap-1">
                {meal.kcalMax > 0 && <Pill tone="soft" size="sm" className="w-fit !text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]">{meal.kcalMin}–{meal.kcalMax} kcal</Pill>}
            <MealDays meal={meal} />
          </span>
        </span>
        {/* Desktop: the price sits top-right like the list cards. Phones keep it below, the cards are half-width. */}
        <span className="hidden sm:block">
          <MealSizePrice meal={meal} perTiffin stacked priceClassName="text-primary text-[24px] font-bold tracking-[-0.03em]" />
        </span>
      </div>
      {/* What's in it, same line as the other cards, so a popular pick is never a blind one. */}
      <div className="pr-8"><MealSizeItems items={meal.items} categoryLabels={categoryLabels} /></div>
      <span className="mt-auto pt-1 pr-8 sm:hidden">
        <MealSizePrice meal={meal} perTiffin priceClassName="text-primary text-[22px] font-bold tracking-[-0.03em]" />
      </span>
      <TierMark meal={meal} />
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
      <OptionCard badge selected={active} onClick={onPick} aria-label={`${cardLabel(meal)}, trial`} className="flex min-w-0 gap-3 bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] p-4">
        <IconTile tint="orange" size="lg"><Gift /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Pill tone="brand" size="sm" className="w-fit">Try first</Pill>
          {/* Name and price on one row, the price top-right, as on every other meal card. */}
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-[20px] leading-tight font-semibold tracking-[-0.025em]">{meal.name}</span>
            <MealSizePrice meal={meal} perTiffin stacked priceClassName="text-primary text-[24px] font-bold tracking-[-0.03em]" />
          </div>
          <p className="text-muted-foreground text-sm text-pretty">{meal.description || "Taste it before you commit to a plan."}</p>
          <MealDays meal={meal} />
          <MealSizeItems items={meal.items} categoryLabels={categoryLabels} />
        </div>
      </OptionCard>
    );
  }
  return (
    <OptionCard badge selected={active} onClick={onPick} aria-label={cardLabel(meal)} className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-[20px] leading-tight font-semibold tracking-[-0.025em]">{meal.name}</span>
          {/* Always on its own line under the name, on every card, so long names and short ones line up; the days a
              limited size is made on follow the kcal. */}
          <span className="flex flex-wrap items-center gap-1">
                {meal.kcalMax > 0 && <Pill tone="soft" size="sm" className="!text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]">{meal.kcalMin}–{meal.kcalMax} kcal</Pill>}
            <MealDays meal={meal} />
          </span>
        </span>
        <MealSizePrice meal={meal} perTiffin stacked priceClassName="text-primary text-[24px] font-bold tracking-[-0.03em]" />
      </div>
      {mealOffPct(meal) > 0 && <Pill tone="save" size="sm" className="-mt-1 w-fit">{mealOffPct(meal)}% off</Pill>}
      {meal.description ? <p className="text-muted-foreground -mt-1 text-sm text-pretty">{meal.description}</p> : null}
      <div className="pr-10"><MealSizeItems items={meal.items} categoryLabels={categoryLabels} /></div>
      <TierMark meal={meal} />
    </OptionCard>
  );
}
