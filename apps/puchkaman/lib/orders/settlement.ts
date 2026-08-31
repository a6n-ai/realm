import { dollarsToCloverCents } from "@foundry/clover";

/**
 * Decide how to record a settlement when Clover reports what it actually charged.
 *
 * The card has already been charged by the time we get here, so a disagreement with
 * our quoted total is never a reason to reject: we record the real amount and flag
 * the payment for a human. Refusing to settle would lose money we've taken.
 */
export type Settlement = {
  /** Clover charged something other than the order total. */
  mismatch: boolean;
  /** Amount to record, in dollars — the charged figure when known. */
  settledTotal: number;
  /** Signed difference in cents (positive = charged more than quoted). */
  deltaCents: number;
  paymentStatus: "paid" | "pending_verification";
  /** Ledger direction for the adjustment entry; null when there is nothing to adjust. */
  adjustmentDirection: "credit" | "debit" | null;
};

export function resolveSettlement(quotedTotal: number, chargedCents?: number | null): Settlement {
  const quotedCents = dollarsToCloverCents(quotedTotal);
  const known = chargedCents != null && Number.isFinite(chargedCents);
  const mismatch = known && chargedCents !== quotedCents;

  if (!mismatch) {
    return {
      mismatch: false,
      settledTotal: quotedTotal,
      deltaCents: 0,
      paymentStatus: "paid",
      adjustmentDirection: null,
    };
  }

  const deltaCents = chargedCents! - quotedCents;
  return {
    mismatch: true,
    settledTotal: chargedCents! / 100,
    deltaCents,
    paymentStatus: "pending_verification",
    adjustmentDirection: deltaCents > 0 ? "credit" : "debit",
  };
}
