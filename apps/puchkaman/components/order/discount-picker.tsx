"use client";

import { useId, useState } from "react";
import { Btn } from "@/components/brutal/shared";
import type { DiscountSelection } from "@/lib/cart/use-cart-quote";

export type PublicOffer = {
  publicId: string;
  name: string;
  /** Pre-formatted, e.g. "10% off" or "$3.00 off". */
  label: string;
};

export function DiscountPicker({
  offers,
  value,
  onChange,
  applied,
  invalidCode,
}: {
  offers: PublicOffer[];
  value: DiscountSelection;
  onChange: (next: DiscountSelection) => void;
  /** Names the server actually honoured, so the UI confirms rather than assumes. */
  applied: string[];
  invalidCode: boolean;
}) {
  const id = useId();
  // The code is only sent on Apply. Re-quoting every keystroke would flash
  // "not a valid code" at someone halfway through typing a good one.
  const [draft, setDraft] = useState(value.code ?? "");
  const activeCode = value.code ?? "";

  function toggleOffer(publicId: string) {
    onChange({
      ...value,
      offerPublicIds: value.offerPublicIds.includes(publicId)
        ? value.offerPublicIds.filter((v) => v !== publicId)
        : [...value.offerPublicIds, publicId],
    });
  }

  return (
    <div className="checkout-offers">
      {offers.length ? (
        <fieldset className="checkout-offers__group">
          <legend>Offers</legend>
          {offers.map((o) => (
            <label key={o.publicId} className="eats-check checkout-offer">
              <input
                type="checkbox"
                checked={value.offerPublicIds.includes(o.publicId)}
                onChange={() => toggleOffer(o.publicId)}
              />
              <span className="eats-check__label">{o.name}</span>
              <span className="checkout-offer__value">{o.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="field checkout-field">
        <label htmlFor={`${id}-code`}>Coupon code</label>
        <div className="checkout-code">
          <input
            id={`${id}-code`}
            className="input"
            value={draft}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="SUMMER15"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Inside the checkout <form>, so Enter would otherwise submit it.
              e.preventDefault();
              onChange({ ...value, code: draft.trim() || undefined });
            }}
            aria-invalid={invalidCode || undefined}
          />
          {activeCode ? (
            <Btn
              variant="cream"
              size="sm"
              onClick={() => {
                setDraft("");
                onChange({ ...value, code: undefined });
              }}
            >
              Remove
            </Btn>
          ) : (
            <Btn
              variant="ink"
              size="sm"
              disabled={!draft.trim()}
              onClick={() => onChange({ ...value, code: draft.trim() || undefined })}
            >
              Apply
            </Btn>
          )}
        </div>
        {invalidCode ? (
          <span className="err-msg" role="alert">
            That code isn&apos;t valid right now.
          </span>
        ) : applied.length ? (
          <span className="checkout-hint">Applied: {applied.join(", ")}.</span>
        ) : (
          <span className="checkout-hint">Got a code? Offers and codes stack.</span>
        )}
      </div>
    </div>
  );
}
