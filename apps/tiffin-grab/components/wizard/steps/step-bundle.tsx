import { Fragment, useState } from "react";
import { listableMealSizes, type ClientCatalogSnapshot, type ClientMealSizeView } from "@/lib/catalog/types";
import { DEFAULT_EATING_DAYS, offeredAddons, type WizardSelections } from "../selections";
import { AddonsPanel } from "../addons-panel";
import { ChevronDown, Gift } from "lucide-react";
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
  const [level, setLevel] = useState<"all" | ClientMealSizeView["tier"]>("all");
  const [showAll, setShowAll] = useState(false);
  const meals = listableMealSizes(catalog.mealSizes).filter((m) => m.planKey === selections.planKey);
  const ordered = meals.filter((m) => !m.trial);
  const levels = TIERS.filter((t) => ordered.some((m) => m.tier === t));
  const inLevel = (m: ClientMealSizeView) => level === "all" || m.tier === level;
  const ranked = popular.map((id) => ordered.find((m) => m.publicId === id)).filter((m): m is ClientMealSizeView => !!m);
  // Always two: a plan with fewer ordered sizes is topped up from the catalog's own order.
  const top = [...ranked, ...ordered.filter((m) => !ranked.includes(m))].slice(0, Math.min(2, ordered.length));
  // Order: best sellers, then the trial (when there is one), then the rest highest price first: the fuller (and most profitable) thalis, Maharaja today, lead the list.
  const price = (m: ClientMealSizeView) => (m.discountType === "none" ? m.basePrice : effectivePrice(m.basePrice, m));
  const weeklyAll = meals.filter((m) => !m.trial && !top.includes(m)).sort((x, y) => price(y) - price(x));
  // Common path first: a few sizes, the rest one tap away. A filter, or a picked size further down, shows them all.
  const FOLD = 4;
  const picked = weeklyAll.findIndex((m) => m.publicId === selections.mealSizeId);
  const folded = level === "all" && !showAll && picked < FOLD && weeklyAll.length > FOLD + 1;
  const weekly = weeklyAll.filter(inLevel).slice(0, folded ? FOLD : undefined);
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
      {levels.length > 1 && (
        // Liquid-glass capsule filter by price level; a filter, so plain toggle buttons rather than tabs.
        <div role="group" aria-label="Filter by price" className="c-liquid inline-flex gap-1 rounded-full p-1">
          {(["all", ...levels] as const).map((l) => {
            const on = level === l;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                aria-label={l === "all" ? "All prices" : TIER_MARK[l].label}
                onClick={() => setLevel(l)}
                className={`min-h-9 min-w-12 rounded-full px-3.5 text-[13px] font-bold tracking-[0.04em] [touch-action:manipulation] transition-colors duration-150 motion-reduce:transition-none ${on ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              >
                {l === "all" ? "All" : TIER_MARK[l].mark}
              </button>
            );
          })}
        </div>
      )}
      {top.filter(inLevel).length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-3 text-[13px] font-semibold tracking-[0.02em]">Best sellers</h3>
          {/* One per row on phones (room for name, price and what's in it), two across from sm up. */}
          <div className={top.filter(inLevel).length > 1 ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid gap-3"}>
            {top.filter(inLevel).map((m) => <PopularOption key={m.publicId} meal={m} categoryLabels={catalog.categoryLabels} active={selections.mealSizeId === m.publicId} onPick={() => pick(m)} />)}
            {top.some((m) => m.publicId === selections.mealSizeId) && eligibleAddons.length > 0 && (
              <AddonsPanel addons={eligibleAddons} categoryLabels={catalog.categoryLabels} categoryIcons={catalog.categoryIcons} selections={selections} set={set} className="hidden sm:col-span-2 sm:block" />
            )}
          </div>
        </section>
      )}
      {trials.length > 0 && trial && level === "all" && (
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
      {/* No tier headings: every size in one grid, highest price first; each card carries its $ / $$ / $$$ mark. */}
      {weekly.length > 0 && (
        <section>
        <h3 className="text-muted-foreground mb-3 text-[13px] font-semibold tracking-[0.02em]">All plans</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {weekly.map((m) => (
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
        </section>
      )}
      {(folded || (showAll && level === "all" && weeklyAll.length > FOLD + 1)) && (
        // Toggles both ways: folding back keeps the long list one tap from tidy.
        <button
          type="button"
          aria-expanded={!folded}
          onClick={() => setShowAll(folded)}
          className="c-surface text-foreground mx-auto flex min-h-11 items-center gap-2 rounded-full bg-[var(--card)] px-5 text-[15px] font-semibold transition-transform duration-100 active:scale-[.97] motion-reduce:active:scale-100"
        >
          {folded ? `See all sizes · ${weeklyAll.length - weekly.length} more` : "Show fewer"}
          <ChevronDown aria-hidden className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${folded ? "" : "rotate-180"}`} />
        </button>
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
  return (
    <span aria-label={t.label} className="shrink-0 text-[13px] font-bold tracking-[0.08em] text-[var(--s-delivered-fg,#059669)]">
      {t.mark}
    </span>
  );
}

/** What a screen reader hears for a meal card: the name and its per-tiffin price, not just "pressed". */
const cardLabel = (meal: ClientMealSizeView) =>
  `${meal.name}, $${(meal.discountType === "none" ? meal.basePrice : effectivePrice(meal.basePrice, meal)).toFixed(2)} per tiffin`;

function PopularOption({ meal, active, categoryLabels, onPick }: { meal: ClientMealSizeView; active: boolean; categoryLabels?: Record<string, string>; onPick: () => void }) {
  return (
    <OptionCard badge selected={active} onClick={onPick} aria-label={cardLabel(meal)} className="flex min-w-0 flex-col gap-2 p-4">
      <Pill tone="up" size="sm" className="w-fit">Best seller</Pill>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-[20px] leading-tight font-semibold tracking-[-0.025em] text-balance">{meal.name}</span>
          <span className="flex flex-wrap items-center gap-1">
                {meal.kcalMax > 0 && <Pill tone="soft" size="sm" className="w-fit !text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]">{meal.kcalMin}–{meal.kcalMax} kcal</Pill>}
            <MealDays meal={meal} />
          </span>
        </span>
        {/* Price top-right, as on every meal card: one popular card per row on phones, so there's room. */}
        <MealSizePrice meal={meal} perTiffin stacked priceClassName="text-primary text-[24px] font-bold tracking-[-0.03em]" />
      </div>
      {/* What's in it, same line as the other cards, so a popular pick is never a blind one. */}
      {/* What's in it on the left, the price level on the same line at the right. */}
      <div className="flex items-baseline justify-between gap-3">
        <MealSizeItems items={meal.items} categoryLabels={categoryLabels} />
        <TierMark meal={meal} />
      </div>
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
          <Pill tone="vac" size="sm" className="w-fit">Try first</Pill>
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
      <div className="flex items-baseline justify-between gap-3">
        <MealSizeItems items={meal.items} categoryLabels={categoryLabels} />
        <TierMark meal={meal} />
      </div>
    </OptionCard>
  );
}
