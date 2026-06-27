import type { PricingTier } from "./tiers";

export interface PricingSelections {
  mealSizeId: string;
  frequencyKey: "5_day" | "mwf";
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  durationWeeks: number;
  startDate: string; // ISO YYYY-MM-DD; not used by pricing, carried for order creation
}

export interface PricingCatalog {
  mealSize: { id: string; basePrice: number };
  frequency: { key: string; daysPerWeek: number };
  tiers: PricingTier[];
}

export interface PricingLine {
  label: string;
  amount: number;
}

export interface PricingResult {
  lineItems: PricingLine[];
  adjustments: PricingLine[]; // resolved discount lines (positive magnitudes), subtracted from subtotal
  tiffinCount: number;
  perTiffinPrice: number;
  tier: PricingTier;
  subtotal: number;
  total: number;
}
