import { money } from "@/lib/cart/types";

/**
 * The money block, shared by the cart page and checkout so both surfaces state
 * the same thing about what is and isn't final. Before the server has priced
 * the cart we only know an estimated subtotal; after, every figure is Clover's.
 */
export function OrderSummary({
  subtotal,
  tax,
  total,
  discountAmount,
  priced,
}: {
  subtotal: number;
  tax?: number;
  total?: number;
  discountAmount?: number;
  priced: boolean;
}) {
  return (
    <dl className="order-summary">
      <div className="order-summary__row">
        <dt>Subtotal</dt>
        <dd>{money(subtotal)}</dd>
      </div>
      {discountAmount ? (
        <div className="order-summary__row order-summary__row--credit">
          <dt>Instant delivery discount</dt>
          <dd>-{money(discountAmount)}</dd>
        </div>
      ) : null}
      <div className="order-summary__row">
        <dt>Tax</dt>
        <dd>{priced ? money(tax ?? 0) : <span className="order-summary__pending">at payment</span>}</dd>
      </div>
      <div className="order-summary__row order-summary__row--total">
        <dt>Total</dt>
        <dd>{priced ? money(total ?? 0) : <span className="order-summary__pending">at payment</span>}</dd>
      </div>
      <p className="order-summary__note">
        {priced
          ? "Priced by Clover. This is exactly what your card is charged."
          : "Estimate. Clover prices the order server-side before you pay."}
      </p>
    </dl>
  );
}
