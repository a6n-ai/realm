import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { DEFAULT_EATING_DAYS, FIXED_PERSONS, firstBlockedStep, reconcileSelections, type WizardSelections } from "@/components/wizard/selections";

export type RenewSource = {
  planKey: string;
  mealSizePublicId: string | null;
  frequencyKey: string;
  /** Null on legacy orders that never stored days. */
  eatingDays: DayOfWeek[] | null;
  durationWeeks: number;
  trialLength: number | null;
};

/** Orders from before days were stored: the frequency's own weekdays (minus weekends the size doesn't serve), else Mon to Fri. */
function legacyEatingDays(catalog: ClientCatalogSnapshot, src: RenewSource): DayOfWeek[] {
  const weekdays = catalog.frequencies.find((f) => f.key === src.frequencyKey)?.weekdays as DayOfWeek[] | undefined;
  const weekends = catalog.mealSizes.find((m) => m.publicId === src.mealSizePublicId)?.servesWeekends ?? true;
  const days = (weekdays ?? []).filter((d) => weekends || (d !== "sat" && d !== "sun"));
  return days.length ? days : DEFAULT_EATING_DAYS;
}

/**
 * The prior plan as wizard picks, or null when it can't be renewed in one tap (trial, retired
 * size or frequency, days the frequency no longer allows). The wizard's own blocked-step check
 * is the single "usable" rule, so quick renew can never offer what the wizard would refuse.
 */
export function renewSelections(catalog: ClientCatalogSnapshot, src: RenewSource, startDate: string): WizardSelections | null {
  if (src.trialLength != null) return null;
  const eatingDays = src.eatingDays?.length ? src.eatingDays : legacyEatingDays(catalog, src);
  const s = reconcileSelections(catalog, {
    planKey: src.planKey,
    mealSizeId: src.mealSizePublicId ?? "",
    frequencyKey: src.frequencyKey,
    eatingDays,
    persons: FIXED_PERSONS,
    mealSlots: [],
    includeSaturday: eatingDays.includes("sat"),
    includeSunday: eatingDays.includes("sun"),
    durationWeeks: src.durationWeeks,
    startDate,
    addonSelections: [],
  });
  return firstBlockedStep(catalog, s) === null ? s : null;
}

/** Quote links and the "full" escape hatch keep the stepper; a missing prior plan has nothing to renew. */
export function renewPageMode(p: { quoteParams: boolean; full: boolean; data: unknown | null }): "quick" | "wizard" {
  return p.quoteParams || p.full || p.data == null ? "wizard" : "quick";
}
