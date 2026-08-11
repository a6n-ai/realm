"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Pill } from "@/components/brutal/shared";
import { cartLineKey, cartUnitPrice, money, type CartItem } from "@/lib/cart/types";
import { useCart } from "@/components/cart/cart-provider";

/** Matches the `[data-removing]` transition in globals.css. */
const EXIT_MS = 150;

export function CartLines({
  items,
  compact = false,
}: {
  items: CartItem[];
  compact?: boolean;
}) {
  const { incrementQty, decrementQty, removeItem } = useCart();
  // Removal is held for the length of the exit so the line leaves rather than
  // vanishing. Keyed by line, because two lines can be on their way out at once.
  const [removing, setRemoving] = useState<string[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const remove = useCallback(
    (lineKey: string) => {
      setRemoving((prev) => (prev.includes(lineKey) ? prev : [...prev, lineKey]));
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timers.current.push(
        window.setTimeout(() => {
          removeItem(lineKey);
          setRemoving((prev) => prev.filter((k) => k !== lineKey));
        }, reduced ? 0 : EXIT_MS),
      );
    },
    [removeItem],
  );

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
      {items.map((item) => {
        // Same product with different modifiers is a distinct line, so every
        // identity — React key, quantity, removal — keys off the modifier set.
        const lineKey = cartLineKey(item);
        const unitPrice = cartUnitPrice(item);
        return (
        <li
          key={lineKey}
          className="card cart-line"
          data-removing={removing.includes(lineKey) || undefined}
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
              {item.modifiers.length ? (
                <ul
                  style={{
                    listStyle: "none",
                    margin: "6px 0 0",
                    padding: 0,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    opacity: 0.8,
                  }}
                >
                  {item.modifiers.map((m) => (
                    <li key={m.cloverModifierId}>
                      + {m.name}
                      {m.price > 0 ? ` (${money(m.price)})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <strong style={{ fontSize: "1.05rem", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {money(unitPrice * item.quantity)}
            </strong>
          </div>
          <div className="flex center between" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="flex center" style={{ gap: 8 }} role="group" aria-label={`Quantity for ${item.name}`}>
              <Btn
                variant="cream"
                size="sm"
                aria-label={`Decrease ${item.name}`}
                // At one, "decrease" IS removal — routed through the same exit so
                // the line leaves the same way either button takes it.
                onClick={() => (item.quantity <= 1 ? remove(lineKey) : decrementQty(lineKey))}
                style={{ minWidth: 44, minHeight: 44 }}
              >
                −
              </Btn>
              <span
                aria-live="polite"
                style={{
                  fontWeight: 800,
                  minWidth: 28,
                  textAlign: "center",
                  fontSize: "1.05rem",
                  // Tabular figures so 1 -> 2 does not shift the +/- buttons.
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.quantity}
              </span>
              <Btn
                variant="ink"
                size="sm"
                aria-label={`Increase ${item.name}`}
                onClick={() => incrementQty(lineKey)}
                style={{ minWidth: 44, minHeight: 44 }}
              >
                +
              </Btn>
            </div>
            <button
              type="button"
              className="cart-remove"
              onClick={() => remove(lineKey)}
              aria-label={`Remove ${item.name}`}
            >
              Remove
            </button>
          </div>
          <p style={{ fontSize: "0.78rem", fontWeight: 500, opacity: 0.7, margin: 0 }}>
            Est. {money(unitPrice)} each · final total set server-side at checkout
          </p>
        </li>
        );
      })}
    </ul>
  );
}
