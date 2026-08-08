import { money } from "@/lib/cart/types";

/**
 * The money block, shared by the cart page and checkout so both surfaces say the
 * same thing about how final each figure is.
 *
 *  estimate — client-side subtotal only, no tax known yet
 *  quoted   — server-priced, tax forecast from the mirrored Clover rates
 *  final    — Clover priced the real order; this is what the card is charged
 */
export type SummaryStage = "estimate" | "quoted" | "final";

export function OrderSummary({
  subtotal,
  tax,
  total,
  discountAmount,
  discountLines,
  taxLines,
  stage,
}: {
  subtotal: number;
  tax?: number;
  total?: number;
  discountAmount?: number;
  /** Named lines when known; falls back to one lump "Discount" row. */
  discountLines?: { name: string; amount: number }[];
  taxLines?: { name: string; amount: number }[];
  stage: SummaryStage;
}) {
  const known = stage !== "estimate";
  // One tax line reads better as just "Tax"; a merchant with several (HST + a
  // bag levy, say) gets them itemised so the number is checkable.
  const itemised = known && (taxLines?.length ?? 0) > 1;

  return (
    <dl className="order-summary">
      <div className="order-summary__row">
        <dt>Subtotal</dt>
        <dd>{money(subtotal)}</dd>
      </div>
      {discountLines?.length
        ? discountLines.map((d, i) => (
            <div className="order-summary__row order-summary__row--credit" key={`${d.name}-${i}`}>
              <dt>{d.name}</dt>
              <dd>-{money(d.amount)}</dd>
            </div>
          ))
        : discountAmount
          ? (
              <div className="order-summary__row order-summary__row--credit">
                <dt>Discount</dt>
                <dd>-{money(discountAmount)}</dd>
              </div>
            )
          : null}
      {itemised ? (
        taxLines!.map((t) => (
          <div className="order-summary__row" key={t.name}>
            <dt>{t.name}</dt>
            <dd>{money(t.amount)}</dd>
          </div>
        ))
      ) : (
        <div className="order-summary__row">
          <dt>Tax</dt>
          <dd>
            {known ? money(tax ?? 0) : <span className="order-summary__pending">calculating…</span>}
          </dd>
        </div>
      )}
      <div className="order-summary__row order-summary__row--total">
        <dt>Total</dt>
        <dd>
          {known ? money(total ?? 0) : <span className="order-summary__pending">calculating…</span>}
        </dd>
      </div>
      <p className="order-summary__note">
        {stage === "final"
          ? "This is exactly what your card is charged."
          : stage === "quoted"
            ? "Tax from your local rates. We confirm the total before you pay."
            : "Estimate. We price the order server-side before you pay."}
      </p>
    </dl>
  );
}
