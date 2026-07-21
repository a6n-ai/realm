import type { ComputedTaxLine } from "@realm/payments";
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
  taxLines: ComputedTaxLine[]; // per-method tax lines applied to the post-discount base
  taxTotal: number; // sum of taxLines (rounded per line), added on top of the taxable base
  tiffinCount: number;
  perTiffinPrice: number;
  tier: PricingTier;
  subtotal: number;
  total: number; // taxable base (subtotal − discounts, floored at 0) + taxTotal
}
