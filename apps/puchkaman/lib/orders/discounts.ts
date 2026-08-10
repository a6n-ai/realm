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

import { couponValue, resolveCoupons, type CouponCandidate } from "@realm/coupons";

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
  /** Epoch ms; null = unbounded on that side. */
  startsAt: number | null;
  expiresAt: number | null;
  /** Dollars, arrives from drizzle numeric as a string. Null = no minimum. */
  minSubtotal: string | number | null;
  stackable: boolean;
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

/**
 * A Clover-synced discount as a neutral candidate for the shared engine.
 *
 * Clover stores deductions as negatives and has no notion of a validity window,
 * usage limit or stacking rule — those are local columns layered on top (see
 * db/schema/inventory.ts) and mapped straight through here.
 */
function toCandidate(row: DiscountSource, subtotal: number, code?: string): CouponCandidate {
  return {
    id: row.publicId,
    name: row.name,
    code,
    percentOff: row.percentage == null ? null : Number(row.percentage),
    // Clover's negatives normalised to positive money off — the engine's contract.
    amountOff: row.amount == null ? null : Math.abs(Number(row.amount)),
    active: row.active,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    // Drizzle numeric columns arrive as strings — Number() them or a "10.00" >
    // 5 minimum-spend comparison silently does string comparison.
    minSubtotal: row.minSubtotal == null ? null : Number(row.minSubtotal),
    stackable: row.stackable,
  };
}

export function resolveDiscounts(
  rows: DiscountSource[],
  request: DiscountRequest,
  subtotal: number,
): ResolvedDiscounts {
  const live = rows.filter((r) => r.active);
  const byPublicId = new Map(live.map((r) => [r.publicId, r]));
  const wanted = new Map<string, { row: DiscountSource; code?: string }>();

  for (const publicId of request.offerPublicIds) {
    const row = byPublicId.get(publicId);
    // Only a discount the merchant published is self-servable. Staff and comp
    // discounts sync from Clover too and must never be claimable by id. This
    // stays here rather than in the engine: publicOffer is a Clover concept.
    if (!row || !row.publicOffer) continue;
    wanted.set(row.publicId, { row });
  }

  const typed = request.code ? normalizeCouponCode(request.code) : "";
  let invalidCode = false;
  if (typed) {
    const row = live.find((r) => r.couponCode && normalizeCouponCode(r.couponCode) === typed);
    // A code that matches nothing, or matches something worth nothing, reads the
    // same to the customer: the code did not work.
    if (!row || couponValue(toCandidate(row, subtotal), subtotal) <= 0) {
      invalidCode = true;
    } else {
      // A code for something already picked as an offer shouldn't apply twice.
      wanted.set(row.publicId, { row, code: typed });
    }
  }

  const entries = [...wanted.values()];
  const resolution = resolveCoupons(
    entries.map(({ row, code }) => toCandidate(row, subtotal, code)),
    { subtotal, now: Date.now() },
  );

  return {
    applied: resolution.applied.map((a) => ({
      publicId: a.id,
      name: a.name,
      amount: a.amount,
      ...(a.code ? { code: a.code } : {}),
    })),
    total: resolution.total,
    invalidCode,
  };
}
