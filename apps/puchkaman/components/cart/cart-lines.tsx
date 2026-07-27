"use client";

import { Btn, Pill } from "@/components/brutal/shared";
import { money, type CartItem } from "@/lib/cart/types";
import { useCart } from "@/components/cart/cart-provider";

export function CartLines({
  items,
  compact = false,
}: {
  items: CartItem[];
  compact?: boolean;
}) {
  const { setQty, removeItem } = useCart();

  if (items.length === 0) {
    return (
      <p style={{ fontWeight: 600, opacity: 0.85 }}>
        Your cart is empty — grab something from the menu.
      </p>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: compact ? 10 : 14,
      }}
    >
      {items.map((item) => (
        <li
          key={item.productPublicId}
          className="card"
          style={{
            padding: compact ? "12px 14px" : "16px 18px",
            background: "var(--white)",
            display: "grid",
            gap: 10,
          }}
        >
          <div className="flex center between" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {item.category ? (
                <Pill variant="ink" className="cart-line-cat">
                  {item.category}
                </Pill>
              ) : null}
              <h3
                style={{
                  fontSize: compact ? "1.05rem" : "1.15rem",
                  marginTop: item.category ? 6 : 0,
                  lineHeight: 1.15,
                }}
              >
                {item.name}
              </h3>
            </div>
            <strong style={{ fontSize: "1.05rem", flexShrink: 0 }}>
              {money(item.price * item.quantity)}
            </strong>
          </div>
          <div className="flex center between" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="flex center" style={{ gap: 8 }} role="group" aria-label={`Quantity for ${item.name}`}>
              <Btn
                variant="cream"
                size="sm"
                aria-label={`Decrease ${item.name}`}
                onClick={() => setQty(item.productPublicId, item.quantity - 1)}
                style={{ minWidth: 44, minHeight: 44 }}
              >
                −
              </Btn>
              <span
                aria-live="polite"
                style={{ fontWeight: 800, minWidth: 28, textAlign: "center", fontSize: "1.05rem" }}
              >
                {item.quantity}
              </span>
              <Btn
                variant="ink"
                size="sm"
                aria-label={`Increase ${item.name}`}
                onClick={() => setQty(item.productPublicId, item.quantity + 1)}
                style={{ minWidth: 44, minHeight: 44 }}
              >
                +
              </Btn>
            </div>
            <button
              type="button"
              className="cart-remove"
              onClick={() => removeItem(item.productPublicId)}
              aria-label={`Remove ${item.name}`}
            >
              Remove
            </button>
          </div>
          <p style={{ fontSize: "0.78rem", fontWeight: 500, opacity: 0.7, margin: 0 }}>
            Est. {money(item.price)} each · final total set server-side at checkout
          </p>
        </li>
      ))}
    </ul>
  );
}
