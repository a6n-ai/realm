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
 * The subscribe wizard still sells one person per order and no separate
 * weekend delivery (weekend tiffins ship with Friday's delivery — see
 * `orderDeliveryDays`/`materializeDeliveries`). That part is unchanged.
 *
 * Delivery frequency itself is no longer locked to 5-day: every active
 * `delivery_frequencies` catalog row (including admin-configured alternate
 * cadences) is selectable. `catalog.frequencies` already comes pre-filtered
 * to active rows, so nothing here needs to re-check availability.
 */
export const FIXED_PERSONS = 1;

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
  addonSelections: [],
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
    frequencyKey: "5_day",
    persons: FIXED_PERSONS,
    mealSlots: plan?.offeredSlots ?? [],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: prior.durationWeeks > 0 ? prior.durationWeeks : 1,
    startDate: "",
    // Not carried over, same reasoning as frequencyKey/persons above — re-picked fresh.
    addonSelections: [],
  };
}
