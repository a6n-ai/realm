/** Why an unpaid card payment can no longer be paid (order cancelled, link expired or void), or null. */
export function cardPayClosed(orderStatus: string, expiresAt: number | null, now = Date.now()): string | null {
  if (orderStatus === "cancelled") return "This order was cancelled";
  if (expiresAt != null && expiresAt <= now) return "This payment link has expired. Ask us for a new one.";
  return null;
}
