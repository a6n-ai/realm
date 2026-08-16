import type { PricingSelections } from "@/lib/pricing";

export interface WizardSelections extends PricingSelections {
  planKey: "veg" | "non-veg" | "healthy" | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

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
