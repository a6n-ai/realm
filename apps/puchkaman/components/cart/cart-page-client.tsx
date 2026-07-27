"use client";

import { Btn } from "@/components/brutal/shared";
import { CartLines } from "@/components/cart/cart-lines";
import { useCart } from "@/components/cart/cart-provider";
import { money } from "@/lib/cart/types";

export function CartPageClient() {
  const { items, count, subtotal, hydrated, clear } = useCart();

  if (!hydrated) {
    return <p style={{ fontWeight: 600 }}>Loading cart…</p>;
  }

  return (
    <div className="card card--cream" style={{ padding: "clamp(20px,3.5vw,32px)" }}>
      <div className="flex center between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h2 className="display" style={{ fontSize: "1.5rem", margin: 0 }}>
          {count === 0 ? "Nothing here yet" : `${count} item${count === 1 ? "" : "s"}`}
        </h2>
        <strong style={{ fontSize: "1.3rem" }}>{money(subtotal)}</strong>
      </div>

      <CartLines items={items} />

      <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
        <p style={{ fontSize: "0.85rem", fontWeight: 500, opacity: 0.75, margin: 0 }}>
          Est. subtotal only. Final charge is priced on the server when you place the order.
        </p>
        <Btn page="checkout" variant="red" size="lg" block disabled={count === 0} style={{ minHeight: 52 }}>
          Checkout →
        </Btn>
        {count > 0 ? (
          <Btn variant="cream" onClick={clear}>
            Clear cart
          </Btn>
        ) : (
          <Btn page="eats" variant="ink" size="lg" block>
            Browse menu
          </Btn>
        )}
      </div>
    </div>
  );
}
