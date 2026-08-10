"use client";

import { money } from "@/lib/cart/types";

/** Matches the `types[]` entries in POST /api/delivery/check-address's response. */
export type CheckoutDeliveryType = {
  key: string;
  label: string;
  minSubtotal: number;
  discountPct: number;
  requiresSchedule: boolean;
};

/**
 * Radio cards for the delivery types a checked address qualifies for. A type
 * the cart can't afford renders disabled with the exact shortfall — never
 * hidden, so the customer knows what to add rather than wondering why an
 * option vanished.
 */
export function DeliveryTypePicker({
  types,
  subtotal,
  value,
  onChange,
}: {
  types: CheckoutDeliveryType[];
  subtotal: number;
  value: string | null;
  onChange: (key: string) => void;
}) {
  // Only worth saying "no discount" when another option on this list does
  // carry one — otherwise it reads as bad news about the only choice there is.
  const someTypeDiscounts = types.some((t) => t.discountPct > 0);

  return (
    <div className="checkout-fulfillment" role="radiogroup" aria-label="Delivery type">
      {types.map((type) => {
        const shortfall = type.minSubtotal - subtotal;
        const disabled = shortfall > 0;
        const discountAmount = (subtotal * type.discountPct) / 100;
        const hint = disabled
          ? `Add ${money(shortfall)} more to qualify`
          : [
              type.discountPct > 0
                ? `${Math.round(type.discountPct)}% off — save ${money(discountAmount)}`
                : someTypeDiscounts
                  ? "No delivery discount"
                  : null,
              type.minSubtotal > 0 ? `${money(type.minSubtotal)} minimum` : null,
              type.requiresSchedule ? "pick a time" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No minimum";
        return (
          <button
            key={type.key}
            type="button"
            role="radio"
            aria-checked={value === type.key}
            className={`checkout-choice ${value === type.key ? "is-active" : ""}`}
            disabled={disabled}
            aria-disabled={disabled}
            style={disabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
            onClick={() => {
              if (!disabled) onChange(type.key);
            }}
          >
            <span className="checkout-choice__label">{type.label}</span>
            <span className="checkout-choice__hint">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
