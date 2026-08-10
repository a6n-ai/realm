import type { DeliveryType } from "./zones";

/**
 * The delivery_types row that governs a pickup order. Pickup carries no
 * address and no zone, but it does carry a configurable discount — the
 * merchant sets it in Settings the same way as the delivery tiers.
 */
export const PICKUP_TYPE_KEY = "pickup";

const money = (n: number): number => Math.round(n * 100) / 100;

/** The only money effect of delivery. There is no fee — see the spec's non-goals. */
export function applyTypeDiscount(input: { subtotal: number; type: DeliveryType }): {
  discountAmount: number;
} {
  return { discountAmount: money(input.subtotal * (input.type.discountPct / 100)) };
}
