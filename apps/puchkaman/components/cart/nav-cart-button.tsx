"use client";

import { useCart } from "@/components/cart/cart-provider";

export function NavCartButton() {
  const { count, openDrawer, badgePulse, hydrated } = useCart();
  const label = !hydrated || count === 0 ? "Open cart" : `Open cart, ${count} items`;

  return (
    <button
      type="button"
      className={`nav-cart${badgePulse ? " nav-cart--pulse" : ""}`}
      onClick={openDrawer}
      aria-label={label}
    >
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
        🛒
      </span>
      {hydrated && count > 0 ? (
        <span className="nav-cart__badge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
