"use client";

import { useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { money } from "@/lib/cart/types";

export type CoinsQuote = {
  requested: number;
  coinsSpent: number;
  applied: number;
  /** Set instead of silently applying $0 when the cap rounds the spend away. */
  message: string | null;
} | null;

/**
 * The redeem control on checkout. Anonymous checkout can't spend coins — an
 * order's user row is provisioned mid-transaction, so there is no balance to
 * debit yet — so a guest gets a sign-in prompt, not a disabled input with no
 * explanation.
 */
export function CoinsControl({
  canRedeem,
  balance,
  value,
  onChange,
  quote,
  locked,
}: {
  /** False for guests and staff sessions — see getCheckoutWalletBalance. */
  canRedeem: boolean;
  balance: number;
  /** Coins the customer wants to spend, or null. */
  value: number | null;
  onChange: (next: number | null) => void;
  quote: CoinsQuote;
  /** Priced by Clover already — redemption is settled and no longer editable. */
  locked?: boolean;
}) {
  const [draft, setDraft] = useState(value ? String(value) : "");

  if (!canRedeem) {
    return (
      <p className="checkout-hint savings__coins">
        <a href="/login?callbackUrl=/checkout">Sign in</a> to spend your coins on this order.
      </p>
    );
  }

  if (balance <= 0) {
    return <p className="checkout-hint savings__coins">You have 0 coins to spend right now.</p>;
  }

  function apply() {
    const n = Math.max(0, Math.min(balance, Math.floor(Number(draft) || 0)));
    onChange(n > 0 ? n : null);
  }

  return (
    <div className="field checkout-field savings__coins">
      <label htmlFor="checkout-coins">Use coins ({balance} available)</label>
      <div className="checkout-code">
        <input
          id="checkout-coins"
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          max={balance}
          value={draft}
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            apply();
          }}
        />
        {value ? (
          <Btn
            variant="cream"
            size="sm"
            disabled={locked}
            onClick={() => {
              setDraft("");
              onChange(null);
            }}
          >
            Remove
          </Btn>
        ) : (
          <Btn variant="ink" size="sm" disabled={locked || !draft.trim()} onClick={apply}>
            Apply
          </Btn>
        )}
      </div>
      {quote?.message ? (
        <span className="err-msg" role="alert">
          {quote.message}
        </span>
      ) : quote && quote.applied > 0 ? (
        <span className="checkout-hint">
          Spending {quote.coinsSpent} coin{quote.coinsSpent === 1 ? "" : "s"} · -{money(quote.applied)}
        </span>
      ) : (
        <span className="checkout-hint">Coins are capped to what&apos;s left to pay.</span>
      )}
    </div>
  );
}
