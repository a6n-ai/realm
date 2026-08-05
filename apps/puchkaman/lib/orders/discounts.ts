/**
 * Which discounts a cart actually gets.
 *
 * Clover has no coupon primitive — a Clover discount is a name plus an amount or
 * a percentage, with no code, expiry or usage limit. So the code lives on our
 * discount row while the money still comes from the synced Clover discount, and
 * this module decides what a given request is entitled to.
 *
 * Nothing here trusts the browser: the client sends offer ids and a typed code,
 * never an amount. Discounts stack (a coupon does not cancel the instant-delivery
 * discount) but the stack is capped at the subtotal so an order can never go
 * negative.
 */

export type DiscountSource = {
  publicId: string;
  name: string;
  /** Fixed amount in dollars. Clover often stores these negative. */
  amount: string | number | null;
  /** Percent off, 0-100. */
  percentage: string | number | null;
  active: boolean;
  publicOffer: boolean;
  couponCode: string | null;
};

export type DiscountRequest = {
  offerPublicIds: string[];
  code?: string | null;
};

export type AppliedDiscount = {
  publicId: string;
  name: string;
  /** Positive dollars taken off. */
  amount: number;
  /** Set when this discount was redeemed by typing its code. */
  code?: string;
};

export type ResolvedDiscounts = {
  applied: AppliedDiscount[];
  /** Positive dollars, capped at the subtotal. */
  total: number;
  /** A code was typed but matched no live coupon. Surfaced, never fatal. */
  invalidCode: boolean;
};

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Percentage wins when a row somehow carries both — it is what Clover bills. */
function valueOf(row: DiscountSource, subtotal: number): number {
  const pct = row.percentage == null ? 0 : Number(row.percentage);
  if (Number.isFinite(pct) && pct > 0) {
    return Number(((subtotal * pct) / 100).toFixed(2));
  }
  const amount = row.amount == null ? 0 : Number(row.amount);
  // Clover stores deductions as negatives; we deal in positive money off.
  return Number.isFinite(amount) ? Math.abs(Number(amount.toFixed(2))) : 0;
}

export function resolveDiscounts(
  rows: DiscountSource[],
  request: DiscountRequest,
  subtotal: number,
): ResolvedDiscounts {
  const live = rows.filter((r) => r.active);
  const byPublicId = new Map(live.map((r) => [r.publicId, r]));
  const wanted = new Map<string, AppliedDiscount>();

  for (const publicId of request.offerPublicIds) {
    const row = byPublicId.get(publicId);
    // Only a discount the merchant published is self-servable. Staff and comp
    // discounts sync from Clover too and must never be claimable by id.
    if (!row || !row.publicOffer) continue;
    const amount = valueOf(row, subtotal);
    if (amount <= 0) continue;
    wanted.set(row.publicId, { publicId: row.publicId, name: row.name, amount });
  }

  const typed = request.code ? normalizeCouponCode(request.code) : "";
  let invalidCode = false;
  if (typed) {
    const row = live.find((r) => r.couponCode && normalizeCouponCode(r.couponCode) === typed);
    const amount = row ? valueOf(row, subtotal) : 0;
    if (!row || amount <= 0) {
      invalidCode = true;
    } else {
      // A code for something already picked as an offer shouldn't apply twice.
      wanted.set(row.publicId, { publicId: row.publicId, name: row.name, amount, code: typed });
    }
  }

  const applied = [...wanted.values()];
  const raw = applied.reduce((s, d) => s + d.amount, 0);
  return {
    applied,
    total: Number(Math.min(raw, subtotal).toFixed(2)),
    invalidCode,
  };
}
