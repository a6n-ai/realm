"use client";

import { Btn, Pill } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import { DeliveryChecker } from "@/components/order/delivery-checker";
import { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";
import { money } from "@/lib/cart/types";

/**
 * The two ways to order direct, side by side and equally weighted: pickup and
 * our own delivery. Both run the same cart and the same server-priced
 * checkout, so the page's job is only to route — the delivery card asks for an
 * address because that's the one thing pickup doesn't need.
 */
export function OrderPaths() {
  const { count, subtotal, openDrawer, hydrated, orderingEnabled } = useCart();
  const hasItems = hydrated && count > 0;

  if (!orderingEnabled) {
    return (
      <div className="card card--cream" style={{ padding: "clamp(22px,3.5vw,36px)" }}>
        <Pill variant="ink">Coming soon</Pill>
        <h2 className="display" style={{ fontSize: "clamp(2rem,5.5vw,3.2rem)", margin: "12px 0 8px" }}>
          Online ordering soon
        </h2>
        <p style={{ fontWeight: 500, fontSize: "1.1rem", margin: "0 0 18px", maxWidth: 480 }}>
          {PUBLIC_ORDERING_UNAVAILABLE_MESSAGE}
        </p>
        <Btn page="eats" variant="green" size="lg">
          Browse menu
        </Btn>
      </div>
    );
  }

  return (
    <div className="order-paths">
      {/* Pickup — the fastest, cheapest path, so it carries the green. */}
      <div className="card card--green surface-green order-path" style={{ color: "#fff" }}>
        <div>
          <Pill variant="yellow">~15 min</Pill>
          <h2 className="display order-path__title">Pickup</h2>
          <p className="order-path__lede">
            Order ahead, walk in, walk out. No fees, no waiting on a courier — and the crunch is
            minutes old.
          </p>
          <p className="order-path__meta mono">3315 Danforth Ave, Scarborough</p>
        </div>

        <div>
          {hasItems ? (
            <p className="order-path__bag">
              Bag: {count} item{count === 1 ? "" : "s"} · est. {money(subtotal)}
            </p>
          ) : null}
          {/* Stacked full-width rather than a wrapping row: three lg buttons
              broke to 2 + 1 in a half-width card, and this mirrors the
              delivery card's block buttons on the other side. */}
          <div className="order-path__actions">
            <Btn page="eats" variant="yellow" block>
              Browse menu
            </Btn>
            {hasItems ? (
              <>
                <Btn variant="cream" block onClick={openDrawer}>
                  Open cart
                </Btn>
                <Btn page="checkout" variant="ink" block>
                  Checkout →
                </Btn>
              </>
            ) : (
              <Btn page="cart" variant="cream" block>
                View cart
              </Btn>
            )}
          </div>
        </div>
      </div>

      {/* Delivery — ours, not an app's. One card covers both zones; the address
          check is what decides which one the customer gets. */}
      <div className="card order-path" style={{ background: "var(--white)" }}>
        <div>
          <Pill variant="green">15% off nearby</Pill>
          <h2 className="display order-path__title">Delivery</h2>
          <p className="order-path__lede">
            We deliver it ourselves, so none of it goes to an app. Within 7km it&apos;s instant and
            15% cheaper; past that you pick a time slot up to a day ahead, $35 minimum.
          </p>
        </div>
        <DeliveryChecker />
      </div>
    </div>
  );
}
