export interface PricingSelections {
  mealSizeId: string;
  frequencyKey: "5_day" | "mwf";
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  isStudent: boolean;
  durationWeeks: number;
}

export interface PricingCatalog {
  mealSize: { id: string; basePrice: number };
  frequency: { key: string; daysPerWeek: number; courierDiscountPct: number };
  addons: { saturday: number; sunday: number };
  durationPackage: { weeks: number; discountPct: number };
}

export interface PricingLine {
  label: string;
  amount: number;
}

export interface PricingResult {
  lineItems: PricingLine[];
  discounts: PricingLine[];
  weeklyFee: number;
  durationWeeks: number;
  total: number;
}
