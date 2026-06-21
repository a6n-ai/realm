import type { PricingSelections } from "@/lib/pricing";

export interface WizardSelections extends PricingSelections {
  planKey: "veg" | "halal_nonveg" | "mixed" | null;
}

export interface EnabledSlot {
  key: string;
  label: string;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

export const initialSelections: WizardSelections = {
  planKey: null,
  mealSizeId: "",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "",
};
