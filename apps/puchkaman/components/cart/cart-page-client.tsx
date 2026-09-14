"use client";

import { Btn } from "@/components/brutal/shared";
import { CartLines } from "@/components/cart/cart-lines";
import { useCart } from "@/components/cart/cart-provider";
import { MinOrderBanner } from "@/components/cart/min-order-banner";
import { OrderingUnavailableNotice } from "@/components/order/ordering-unavailable-notice";
import { OrderSummary } from "@/components/order/order-summary";
import { money } from "@/lib/cart/types";
import { useCartQuote } from "@/lib/cart/use-cart-quote";

export function CartPageClient() {
  const { items, count, subtotal, hydrated, clear, orderingEnabled, minOrderValue } = useCart();
  const quote = useCartQuote(items);
  const belowMinimum = minOrderValue > 0 && subtotal < minOrderValue;

  if (!hydrated) {
    return <div className="card card--cream checkout-skeleton" aria-busy="true" />;
  }

  if (!orderingEnabled) {
    return <OrderingUnavailableNotice title="Cart coming soon" />;
  }

  if (count === 0) {
    return (
      <div className="card card--cream cart-panel">
        <h2 className="display cart-panel__title">Nothing here yet</h2>
        <p className="checkout-hint">
          Puchkas, chaats and drinks are all on the menu — add a couple and come back.
        </p>
        <Btn page="eats" variant="green" size="lg" block>
          Browse menu →
        </Btn>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <section className="card card--cream cart-panel">
        <div className="cart-panel__head">
          <h2 className="display cart-panel__title" style={{ margin: 0 }}>
            {count} item{count === 1 ? "" : "s"}
          </h2>
          <button type="button" className="cart-remove" onClick={clear}>
            Clear cart
          </button>
        </div>
        <CartLines items={items} />
      </section>

      <aside className="card cart-summary">
        <MinOrderBanner subtotal={subtotal} minOrderValue={minOrderValue} />
        <OrderSummary
          subtotal={quote?.subtotal ?? subtotal}
          tax={quote?.tax}
          total={quote?.total}
          taxLines={quote?.taxLines}
          stage={quote ? "quoted" : "estimate"}
        />
        <Btn
          page="checkout"
          variant="green"
          size="lg"
          block
          disabled={belowMinimum}
          className="checkout-submit"
        >
          {belowMinimum ? `Add ${money(minOrderValue - subtotal)} more` : "Checkout →"}
        </Btn>
        <Btn page="eats" variant="cream" block>
          Add more
        </Btn>
      </aside>

      {/* Mobile only: the CTA follows the customer down a long cart instead of
          sitting under the last line item. */}
      <div className="cart-stickybar">
        <div className="cart-stickybar__total">
          <span>{quote ? "Total with tax" : "Est. total"}</span>
          <strong>{money(quote?.total ?? subtotal)}</strong>
        </div>
        <Btn page="checkout" variant="green" size="lg" disabled={belowMinimum}>
          {belowMinimum ? `Add ${money(minOrderValue - subtotal)} more` : "Checkout →"}
        </Btn>
      </div>
    </div>
  );
}
