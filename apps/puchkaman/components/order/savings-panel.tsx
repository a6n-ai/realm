"use client";

import { DiscountPicker, type PublicOffer } from "@/components/order/discount-picker";
import { money } from "@/lib/cart/types";
import type { CartQuote, DiscountSelection } from "@/lib/cart/use-cart-quote";

/**
 * Every discount in one place, directly under the bag total — offers, the
 * coupon field, and the delivery-type discount the server folds into the
 * quote. This used to sit at the bottom of the form under name/email/phone,
 * where a customer read the total long before learning there were offers at
 * all.
 *
 * Offers are toggle chips rather than a checkbox list: the same control adds
 * and removes, and an unapplied offer reads as money left on the table
 * (DESIGN.md's selected-chip rule — green fill when on, cream when off).
 */
export function SavingsPanel({
  offers,
  value,
  onChange,
  quote,
  locked,
  nudge,
}: {
  offers: PublicOffer[];
  value: DiscountSelection;
  onChange: (next: DiscountSelection) => void;
  /** Null until the first quote lands. */
  quote: CartQuote | null;
  /** Priced by Clover already — discounts are settled and no longer editable. */
  locked?: boolean;
  /** e.g. a bigger delivery discount is available but not selected. */
  nudge?: string | null;
}) {
  const saved = quote?.discountAmount ?? 0;
  // Clover's priced order reports a total saving without naming its parts;
  // fall back to one lump line rather than claiming there were no discounts.
  const lines =
    quote?.discountLines.length
      ? quote.discountLines
      : saved > 0
        ? [{ name: "Discount", amount: saved }]
        : [];

  function toggleOffer(publicId: string) {
    onChange({
      ...value,
      offerPublicIds: value.offerPublicIds.includes(publicId)
        ? value.offerPublicIds.filter((v) => v !== publicId)
        : [...value.offerPublicIds, publicId],
    });
  }

  return (
    <section className="savings" aria-labelledby="savings-head">
      <div className="savings__head">
        <h3 id="savings-head">Savings</h3>
        {saved > 0 ? <strong className="savings__amount">-{money(saved)}</strong> : null}
      </div>

      {lines.length ? (
        <ul className="savings__lines">
          {lines.map((d, i) => (
            <li key={`${d.name}-${i}`}>
              <span>{d.name}</span>
              <span className="savings__line-amount">-{money(d.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="savings__empty">
          {locked ? "No discounts on this order." : "Nothing applied yet."}
        </p>
      )}

      {nudge ? <p className="savings__nudge">{nudge}</p> : null}

      {locked ? null : (
        <>
          {offers.length ? (
            <div className="savings__offers" role="group" aria-label="Offers">
              {offers.map((o) => {
                const on = value.offerPublicIds.includes(o.publicId);
                return (
                  <button
                    key={o.publicId}
                    type="button"
                    aria-pressed={on}
                    className={`savings__offer ${on ? "is-on" : ""}`}
                    onClick={() => toggleOffer(o.publicId)}
                  >
                    <span className="savings__offer-name">{o.name}</span>
                    <span className="savings__offer-value">{o.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Offers are handled above; the picker keeps the coupon field. */}
          <DiscountPicker
            offers={[]}
            value={value}
            onChange={onChange}
            /* The lines above already confirm what was honoured — repeating
               them under the field just says the same thing twice. */
            applied={[]}
            invalidCode={quote?.invalidCode ?? false}
          />
        </>
      )}
    </section>
  );
}
