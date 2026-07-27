"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Btn } from "@/components/brutal/shared";
import { CartLines } from "@/components/cart/cart-lines";
import { useCart } from "@/components/cart/cart-provider";
import { money } from "@/lib/cart/types";

export function CartDrawer() {
  const { items, count, subtotal, drawerOpen, closeDrawer } = useCart();

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <div
      className={`cart-drawer-root${drawerOpen ? " is-open" : ""}`}
      aria-hidden={!drawerOpen}
    >
      <button
        type="button"
        className="cart-drawer-backdrop"
        aria-label="Close cart"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={closeDrawer}
      />
      <aside
        className="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        inert={!drawerOpen ? true : undefined}
      >
        <div className="cart-drawer__head">
          <div>
            <p className="kicker" style={{ marginBottom: 4 }}>
              Pickup cart
            </p>
            <h2 className="display" style={{ fontSize: "1.55rem", margin: 0 }}>
              {count === 0 ? "Cart" : `${count} item${count === 1 ? "" : "s"}`}
            </h2>
          </div>
          <button
            type="button"
            className="cart-drawer__close"
            onClick={closeDrawer}
            aria-label="Close cart"
          >
            ✕
          </button>
        </div>

        <div className="cart-drawer__body">
          <CartLines items={items} compact />
        </div>

        <div className="cart-drawer__foot">
          <div className="flex center between" style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>Est. subtotal</span>
            <strong style={{ fontSize: "1.2rem" }}>{money(subtotal)}</strong>
          </div>
          <p style={{ fontSize: "0.78rem", fontWeight: 500, opacity: 0.75, marginBottom: 14 }}>
            Prices confirmed server-side when you check out. Card charged after you pay.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            <Btn
              page="checkout"
              variant="green"
              size="lg"
              block
              disabled={count === 0}
              onClick={closeDrawer}
            >
              Checkout →
            </Btn>
            <Btn page="cart" variant="cream" block onClick={closeDrawer}>
              Full cart
            </Btn>
            <Link
              href="/eats"
              onClick={closeDrawer}
              style={{ textAlign: "center", fontWeight: 700, padding: 10 }}
            >
              ← Keep browsing menu
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
