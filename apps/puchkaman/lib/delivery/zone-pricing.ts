import type { Zone } from "./zones";

const money = (n: number): number => Math.round(n * 100) / 100;

/**
 * Discount applies to subtotal; fee is added afterwards and is NOT discountable
 * — otherwise a percentage discount silently eats the courier cost too.
 */
export function applyZonePricing(input: { subtotal: number; zone: Zone }): {
  discountAmount: number;
  feeAmount: number;
} {
  return {
    discountAmount: money(input.subtotal * (input.zone.discountPct / 100)),
    feeAmount: money(input.zone.feeAmount),
  };
}
