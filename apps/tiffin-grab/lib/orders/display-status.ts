/** Payment statuses that mean staff still needs to confirm money before the plan is “fully on”. */
const PAYMENT_REVIEW = new Set(["awaiting_payment", "pending_verification"]);

/** Order statuses where an unpaid payment should override the green “Active” badge. */
const OVERLAY_ORDER = new Set(["active", "pending", "paused"]);

/**
 * Admin list/detail badge value. DB `orders.status` stays `active` so deliveries
 * can materialize while e-Transfer/cash is still awaiting or under review — the
 * UI must not look settled until a payment is verified.
 */
export function orderDisplayStatus(
  orderStatus: string,
  paymentStatuses: readonly (string | null | undefined)[],
): string {
  const needsReview = paymentStatuses.some((s) => s != null && PAYMENT_REVIEW.has(s));
  if (needsReview && OVERLAY_ORDER.has(orderStatus)) return "payment_review";
  return orderStatus;
}
