import type { PricingSelections } from "@/lib/pricing";

export interface WizardSelections extends PricingSelections {
  planKey: "veg" | "halal_nonveg" | "mixed" | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

export const initialSelections: WizardSelections = {
  planKey: null,
  mealSizeId: "",
  frequencyKey: "5_day",
  dailyQty: 1,
  includeSaturday: false,
  includeSunday: false,
  isStudent: false,
  durationWeeks: 1,
};
