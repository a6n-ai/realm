/**
 * Pure, storage-agnostic coupon rule engine shared by tiffin-grab and puchkaman.
 *
 * No I/O, no clock, no database. Callers own persistence (redemption counts,
 * code lookup, DB-specific fields like tiffin-grab's planTypes/rep_daily or
 * puchkaman's Clover-backed publicOffer) and hand this module a flat list of
 * candidates plus a resolved context. `now` is always injected — never read
 * from the clock inside the engine — so callers (and tests) can pin time.
 *
 * Amounts in and out are POSITIVE dollars off. Clover stores discount rows as
 * negative amounts; normalising the sign is the caller's job before building
 * a CouponCandidate, not this module's.
 */

export type CouponCandidate = {
  id: string;
  name: string;
  code?: string | null;
  active: boolean;
  /** 0-100. Takes precedence over amountOff when both are set. */
  percentOff?: number | null;
  /** Positive dollars off. */
  amountOff?: number | null;
  minSubtotal?: number | null;
  /** epoch ms; null = unbounded on that side */
  startsAt?: number | null;
  expiresAt?: number | null;
  maxRedemptions?: number | null;
  redemptionCount?: number;
  maxPerUser?: number | null;
  userRedemptionCount?: number;
  /** false = must be used alone. */
  stackable: boolean;
  /** payment method ids; empty/undefined = valid with all. */
  allowedPaymentMethods?: string[];
};

export type CouponContext = {
  subtotal: number;
  /** epoch ms — always injected, never read from the clock inside the engine. */
  now: number;
  paymentMethod?: string | null;
};

export type IneligibleReason =
  | "inactive"
  | "not_started"
  | "expired"
  | "below_min_subtotal"
  | "redemption_limit"
  | "user_limit"
  | "payment_method";

// Same approach as tiffin-grab's coupons.service.ts round2: Math.round with an
// EPSILON nudge, more robust than toFixed(2) against float noise like 1.005.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** null when the candidate is usable. */
export function ineligibleReason(c: CouponCandidate, ctx: CouponContext): IneligibleReason | null {
  if (!c.active) return "inactive";
  if (c.startsAt != null && ctx.now < c.startsAt) return "not_started";
  if (c.expiresAt != null && ctx.now > c.expiresAt) return "expired";
  if (c.minSubtotal != null && ctx.subtotal < c.minSubtotal) return "below_min_subtotal";
  if (c.maxRedemptions != null && (c.redemptionCount ?? 0) >= c.maxRedemptions) return "redemption_limit";
  if (c.maxPerUser != null && (c.userRedemptionCount ?? 0) >= c.maxPerUser) return "user_limit";
  if (
    c.allowedPaymentMethods?.length &&
    (!ctx.paymentMethod || !c.allowedPaymentMethods.includes(ctx.paymentMethod))
  ) {
    return "payment_method";
  }
  return null;
}

/** Positive dollars off, rounded to cents. 0 when the candidate has no value. */
export function couponValue(c: CouponCandidate, subtotal: number): number {
  // Percentage wins when a candidate somehow carries both (matches puchkaman's
  // valueOf — it's what Clover bills).
  if (c.percentOff != null && c.percentOff > 0) {
    return round2((subtotal * c.percentOff) / 100);
  }
  if (c.amountOff != null && c.amountOff > 0) {
    return round2(c.amountOff);
  }
  return 0;
}

export type AppliedCoupon = { id: string; name: string; amount: number; code?: string };
export type CouponResolution = {
  applied: AppliedCoupon[];
  /** Positive dollars, capped at subtotal. */
  total: number;
  /** Candidates rejected, with why — callers surface this, it is never fatal. */
  rejected: { id: string; reason: IneligibleReason }[];
};

type Usable = { c: CouponCandidate; value: number };

function distribute(set: Usable[], subtotal: number): { applied: AppliedCoupon[]; total: number } {
  let remaining = subtotal;
  const applied: AppliedCoupon[] = [];
  for (const { c, value } of set) {
    const amount = round2(Math.min(value, remaining));
    if (amount <= 0) continue;
    applied.push({ id: c.id, name: c.name, amount, ...(c.code ? { code: c.code } : {}) });
    remaining = round2(remaining - amount);
  }
  return { applied, total: round2(subtotal - remaining) };
}

/**
 * Best legal combination. Values are non-negative, so the maximal all-stackable
 * set dominates any stackable subset; the candidate finals are therefore
 * {all stackable} and each {exclusive} alone. Highest total wins; ties break on
 * fewer coupons then id, so the result is deterministic.
 */
export function resolveCoupons(candidates: CouponCandidate[], ctx: CouponContext): CouponResolution {
  const rejected: { id: string; reason: IneligibleReason }[] = [];
  const usable: Usable[] = [];

  for (const c of candidates) {
    const reason = ineligibleReason(c, ctx);
    if (reason) {
      rejected.push({ id: c.id, reason });
      continue;
    }
    const value = couponValue(c, ctx.subtotal);
    // Zero/negative-value candidates are not "applied" and aren't an eligibility
    // failure either — just nothing to offer this cart.
    if (value > 0) usable.push({ c, value });
  }

  const stackable = usable.filter((u) => u.c.stackable);
  const exclusive = usable.filter((u) => !u.c.stackable);

  const sets: Usable[][] = [];
  if (stackable.length) sets.push(stackable);
  for (const ex of exclusive) sets.push([ex]);

  let best: { applied: AppliedCoupon[]; total: number } = { applied: [], total: 0 };
  for (const set of sets) {
    const result = distribute(set, ctx.subtotal);
    if (result.total > best.total) {
      best = result;
      continue;
    }
    if (result.total === best.total && result.total > 0) {
      const key = (a: AppliedCoupon[]) => [...a.map((x) => x.id)].sort().join(",");
      const fewer = result.applied.length < best.applied.length;
      const tie = result.applied.length === best.applied.length && key(result.applied) < key(best.applied);
      if (fewer || tie) best = result;
    }
  }

  return { applied: best.applied, total: round2(Math.min(best.total, ctx.subtotal)), rejected };
}
