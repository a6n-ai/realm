export type CouponStatus = "active" | "inactive" | "scheduled" | "expired";

type Window = { active: boolean; startsAt?: number | null; expiresAt?: number | null };

/** Redeemable now: on, started, and not past its end (an end instant is still valid). */
export function couponStatus(c: Window, now: number): CouponStatus {
  if (!c.active) return "inactive";
  if (c.startsAt != null && c.startsAt > now) return "scheduled";
  if (c.expiresAt != null && c.expiresAt < now) return "expired";
  return "active";
}
