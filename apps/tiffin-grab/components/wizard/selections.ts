import type { PricingSelections } from "@/lib/pricing";

export interface WizardSelections extends PricingSelections {
  planKey: "veg" | "non-veg" | "healthy" | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

// Which flow wrote WIZARD_STORAGE_KEY — checkout's "Edit plan" back-link reads this to
// return the customer to wherever they actually configured their plan (the full wizard
// vs. the lightweight renew picker), instead of always assuming the wizard.
export const WIZARD_ORIGIN_KEY = "tiffin.wizard.origin";
export type WizardOrigin = "subscribe" | "renew";

export const initialSelections: WizardSelections = {
  planKey: null,
  mealSizeId: "",
  frequencyKey: "5_day",
  persons: 1,
  // Dish selection now happens per-delivery after subscribing; mealSlots is
  // populated from the chosen plan's categories (see StepBaseline) purely to
  // satisfy the pricing guard — the subscriber never picks it directly.
  mealSlots: [],
  // Chosen swap rules (public ids). Cleared whenever the meal size changes —
  // a rule is scoped to exactly one meal size.
  swapRuleIds: [],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "",
};
