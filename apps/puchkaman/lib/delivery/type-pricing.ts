import type { DeliveryType } from "./zones";

const money = (n: number): number => Math.round(n * 100) / 100;

/** The only money effect of delivery. There is no fee — see the spec's non-goals. */
export function applyTypeDiscount(input: { subtotal: number; type: DeliveryType }): {
  discountAmount: number;
} {
  return { discountAmount: money(input.subtotal * (input.type.discountPct / 100)) };
}
