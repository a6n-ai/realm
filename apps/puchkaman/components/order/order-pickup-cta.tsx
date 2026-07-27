"use client";

import { Btn, Pill } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";
import { money } from "@/lib/cart/types";

/** Brutalist hub card — menu → cart → checkout with live bag summary. */
export function OrderPickupCta() {
  const { count, subtotal, openDrawer, hydrated, orderingEnabled } = useCart();

  if (!orderingEnabled) {
    return (
      <div
        className="card card--cream order-pickup-cta"
        style={{
          padding: "clamp(22px,3.5vw,36px)",
          marginBottom: 8,
          opacity: 0.96,
        }}
      >
        <Pill variant="ink">Coming soon</Pill>
        <h2 className="display" style={{ fontSize: "clamp(2rem,5.5vw,3.2rem)", margin: "12px 0 8px" }}>
          Pickup ordering soon
        </h2>
        <p style={{ fontWeight: 500, fontSize: "1.1rem", margin: "0 0 18px", maxWidth: 480 }}>
          {PUBLIC_ORDERING_UNAVAILABLE_MESSAGE}
        </p>
        <div className="flex wrap-gap" style={{ gap: 10 }}>
          <Btn page="eats" variant="green" size="lg">
            Browse menu
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card card--green surface-green order-pickup-cta"
      style={{
        color: "#fff",
        padding: "clamp(22px,3.5vw,36px)",
        marginBottom: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        className="sticker rotate-r"
        style={{ top: 16, right: 16, background: "var(--yellow)", color: "var(--ink-deep)" }}
      >
        💳 PAY HERE
      </span>
      <Pill variant="yellow">PICKUP</Pill>
      <h2 className="display" style={{ fontSize: "clamp(2rem,5.5vw,3.2rem)", margin: "12px 0 8px" }}>
        Order Pickup
      </h2>
      <p style={{ fontWeight: 500, fontSize: "1.1rem", margin: "0 0 18px", maxWidth: 480 }}>
        Menu → cart → card → kitchen. Only active Clover-linked in-stock items. Totals priced
        server-side.
      </p>

      {hydrated && count > 0 ? (
        <p style={{ fontWeight: 700, marginBottom: 16, opacity: 0.95 }}>
          Bag: {count} item{count === 1 ? "" : "s"} · est. {money(subtotal)}
        </p>
      ) : null}

      <div className="flex wrap-gap" style={{ gap: 10 }}>
        <Btn page="eats" variant="yellow" size="lg">
          Browse menu
        </Btn>
        {hydrated && count > 0 ? (
          <>
            <Btn variant="cream" size="lg" onClick={openDrawer}>
              Open cart
            </Btn>
            <Btn page="checkout" variant="ink" size="lg">
              Checkout →
            </Btn>
          </>
        ) : (
          <Btn page="cart" variant="cream" size="lg">
            View cart
          </Btn>
        )}
      </div>
    </div>
  );
}
