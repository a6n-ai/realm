import type { PricingTier } from "./tiers";

export interface PricingSelections {
  mealSizeId: string;
  frequencyKey: "5_day" | "mwf";
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  durationWeeks: number;
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
  adjustments: PricingLine[]; // coupon hook — always [] in this slice
  tiffinCount: number;
  perTiffinPrice: number;
  tier: PricingTier;
  subtotal: number;
  total: number;
}
