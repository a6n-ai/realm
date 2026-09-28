import type { ComputedTaxLine } from "@foundry/payments";
import type { DayOfWeek } from "../menu/delivery-days";
import type { PricingTier } from "./tiers";
import type { DeliveryChargeCalculationResult, DeliveryChargeItemLike } from "@foundry/delivery";
import type { PricingWaiver } from "./waivers";

export interface PricingSelections {
  mealSizeId: string;
  // Matched against delivery_frequencies.key — not a closed enum: any active
  // catalog row (including generated custom-weekday-pattern rows) is valid.
  frequencyKey: string;
  // Weekdays the customer eats. When set, tiffins/week = eatingDays.length and the
  // frequency only decides delivery days; unset keeps the legacy frequency+weekend maths.
  eatingDays?: DayOfWeek[];
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  durationWeeks: number;
  startDate: string; // ISO YYYY-MM-DD; not used by pricing, carried for order creation
  // Add-ons picked in the wizard, with quantity. Optional — omitted/empty means
  // no add-ons, so existing callers built before add-ons existed keep working.
  addonSelections?: { key: string; qty: number }[];
  /** The place type (tag) picked for the address, optional. */
  deliveryTagId?: string | null;
  /** Picked strategies of that tag, at most one per connected set. */
  deliveryStrategyIds?: string[];
  addressTagId?: string | null;
}

export interface PricingCatalog {
  mealSize: { id: string; basePrice: number };
  frequency: { key: string; daysPerWeek: number };
  tiers: PricingTier[];
  // Resolved rate+qty for each of selections.addonSelections, priced per delivery
  // week — buildPricingCatalog rejects any key not attached to the chosen meal
  // size's categories and clamps qty to the addon's maxQty, so by the time this
  // reaches the engine every entry is billable as-is.
  addons: { key: string; name: string; pricePerWeek: number; qty: number }[];
  // Already filtered to those applicable to the selections; engine sums, caps, prints.
  discounts?: { key: string; label: string; percent: number }[];
  maxDiscountPct?: number;
  deliveryCount?: number;
  // Outside the discount cap: they waive fees/tax, not the food price.
  waivers?: PricingWaiver[];
  deliveryChargeConfig?: {
    baseCharge: number;
    deliveryStrategies?: DeliveryChargeItemLike[];
    /** Delivery trips in the whole plan, for per-delivery strategy charges. */
    deliveryCount?: number;
    addressTag?: DeliveryChargeItemLike | null;
  };
}

export interface PricingLine {
  label: string;
  amount: number;
  discountKey?: string;
}

export interface PricingResult {
  lineItems: PricingLine[];
  adjustments: PricingLine[]; // resolved discount lines (positive magnitudes), subtracted from subtotal
  taxLines: ComputedTaxLine[]; // per-method tax lines applied to the post-discount base
  taxTotal: number; // sum of taxLines (rounded per line), added on top of the taxable base
  tiffinCount: number;
  /** Delivery trips over the whole plan (weekend days can ride a Friday trip). */
  deliveryCount?: number;
  perTiffinPrice: number;
  tier: PricingTier;
  subtotal: number;
  total: number; // taxable base (subtotal − discounts, floored at 0) + taxTotal
  deliveryCharge?: DeliveryChargeCalculationResult;
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
  /** Province whose rates produced taxLines, so a receipt can be audited later.
   *  null when the delivery address yielded no province (then taxLines is []). */
  taxProvince?: string | null;
  planType?: string;
  // Staff replaced a custom meal's computed per-TU base price (actor = staff public id).
  basePriceOverride?: { amount: number; computed: number; byPublicId: string | null };
  // Present only when payment is awaiting verification — cleared after redeem-on-verify.
  pendingRedemptions?: PendingRedemption[];
  // Coin spend quoted at checkout but not yet committed — deferred settlement
  // methods park it here; verifyPayment commits it, same as pendingRedemptions.
  pendingCoinRedemption?: { coins: number; amount: number };
};
