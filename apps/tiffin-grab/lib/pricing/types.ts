import type { ComputedTaxLine } from "@foundry/payments";
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

// Coupon rows deferred until staff verifies payment. Stored on the order's
// pricing_snapshot so verifyPayment can redeem without trusting the client.
export type PendingRedemption = {
  couponPublicId: string;
  code: string;
  amount: number;
  // Acting staff public_id when a rep applied the discount; null for customer codes.
  redeemedByPublicId: string | null;
};

// Immutable receipt written onto orders.pricing_snapshot at create time.
export type OrderPricingSnapshot = PricingResult & {
  paymentMethodId: string;
  planType?: string;
  // Present only when payment is awaiting verification — cleared after redeem-on-verify.
  pendingRedemptions?: PendingRedemption[];
  // Coin spend quoted at checkout but not yet committed — deferred settlement
  // methods park it here; verifyPayment commits it, same as pendingRedemptions.
  pendingCoinRedemption?: { coins: number; amount: number };
};
