import type { PricingSelections } from "@/lib/pricing";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

export interface WizardSelections extends PricingSelections {
  planKey: "veg" | "non-veg" | "healthy" | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

// Which flow wrote WIZARD_STORAGE_KEY — checkout's "Edit plan" back-link returns
// the customer to /subscribe or /me/renew, both of which use the same stepper.
export const WIZARD_ORIGIN_KEY = "tiffin.wizard.origin";
export type WizardOrigin = "subscribe" | "renew";

const PLAN_KEYS = ["veg", "non-veg", "healthy"] as const;

/**
 * What the subscribe wizard currently sells: one person, weekdays only, no
 * weekend delivery. Weekend tiffins are cooked and sent out with Friday's
 * delivery, so there is no Saturday or Sunday drop to book.
 *
 * These are UI-and-intake constraints only. `persons`, `includeSaturday` and
 * `includeSunday` stay in the model and the pricing engine because existing
 * orders were placed under the old options and must keep pricing, scheduling
 * and rendering exactly as sold. Widening the offer again means changing this
 * block, not resurrecting removed fields.
 */
export const ONLY_FREQUENCY_KEY = "5_day";
export const FIXED_PERSONS = 1;

/** A frequency the wizard shows but will not let a customer choose yet. */
export function isFrequencyDisabled(key: string): boolean {
  return key !== ONLY_FREQUENCY_KEY;
}

function asPlanKey(key: string | null | undefined): WizardSelections["planKey"] {
  return PLAN_KEYS.find((k) => k === key) ?? null;
}

export const initialSelections: WizardSelections = {
  planKey: null,
  mealSizeId: "",
  frequencyKey: "5_day",
  persons: 1,
  // Dish selection now happens per-delivery after subscribing; mealSlots is
  // populated from the chosen plan's categories (see StepBaseline) purely to
  // satisfy the pricing guard — the subscriber never picks it directly.
  mealSlots: [],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "",
};

/** Prefill the renew stepper from the customer's most recent order. Start date stays empty. */
export function selectionsFromPriorOrder(
  catalog: ClientCatalogSnapshot,
  prior: {
    planKey: string;
    mealSizePublicId?: string | null;
    persons: number;
    includeSaturday: boolean;
    includeSunday: boolean;
    durationWeeks: number;
    frequencyKey: string;
  } | null,
): WizardSelections {
  if (!prior) return initialSelections;
  const planKey = asPlanKey(prior.planKey);
  const plan = catalog.plans.find((p) => p.key === planKey);
  const mealSizeId =
    prior.mealSizePublicId &&
    catalog.mealSizes.some((m) => m.publicId === prior.mealSizePublicId && m.planKey === planKey)
      ? prior.mealSizePublicId
      : "";
  return {
    planKey,
    mealSizeId,
    // Not carried over from the prior order: the controls for these are gone, so
    // restoring 2 persons or a Saturday would silently change the quote with
    // nothing on screen to explain it, and no way for the customer to undo it.
    frequencyKey: ONLY_FREQUENCY_KEY,
    persons: FIXED_PERSONS,
    mealSlots: plan?.offeredSlots ?? [],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: prior.durationWeeks > 0 ? prior.durationWeeks : 1,
    startDate: "",
  };
}
