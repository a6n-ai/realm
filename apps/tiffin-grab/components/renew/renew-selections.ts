import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { FIXED_PERSONS, firstBlockedStep, reconcileSelections, type WizardSelections } from "@/components/wizard/selections";

export type RenewSource = {
  planKey: string;
  mealSizePublicId: string | null;
  frequencyKey: string;
  eatingDays: DayOfWeek[];
  durationWeeks: number;
  trialLength: number | null;
};

/**
 * The prior plan as wizard picks, or null when it can't be renewed in one tap (trial, retired
 * size or frequency, days the frequency no longer allows). The wizard's own blocked-step check
 * is the single "usable" rule, so quick renew can never offer what the wizard would refuse.
 */
export function renewSelections(catalog: ClientCatalogSnapshot, src: RenewSource, startDate: string): WizardSelections | null {
  if (src.trialLength != null) return null;
  const s = reconcileSelections(catalog, {
    planKey: src.planKey,
    mealSizeId: src.mealSizePublicId ?? "",
    frequencyKey: src.frequencyKey,
    eatingDays: src.eatingDays,
    persons: FIXED_PERSONS,
    mealSlots: [],
    includeSaturday: src.eatingDays.includes("sat"),
    includeSunday: src.eatingDays.includes("sun"),
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
