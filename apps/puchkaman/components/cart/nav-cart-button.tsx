"use client";

import { IconCart } from "@/components/brutal/icons";
import { useCart } from "@/components/cart/cart-provider";

export function NavCartButton() {
  const { count, openDrawer, badgePulse, hydrated, orderingEnabled } = useCart();
  if (!orderingEnabled) return null;

  const label = !hydrated || count === 0 ? "Open cart" : `Open cart, ${count} items`;

  return (
    <button
      type="button"
      className={`nav-cart${badgePulse ? " nav-cart--pulse" : ""}`}
      onClick={openDrawer}
      aria-label={label}
    >
      <IconCart />
      {hydrated && count > 0 ? (
        <span className="nav-cart__badge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
