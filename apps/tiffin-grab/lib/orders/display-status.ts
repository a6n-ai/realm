/** Payment statuses that mean staff still needs to confirm money before the plan is “fully on”. */
export const PAYMENT_REVIEW_STATUSES = ["awaiting_payment", "pending_verification"] as const;

/** Money confirmed — kitchen packing and OptimoRoute may fulfill. */
export const PAYMENT_SETTLED_STATUSES = ["paid", "simulated_paid"] as const;

const PAYMENT_REVIEW = new Set<string>(PAYMENT_REVIEW_STATUSES);

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

/** True when payment is still awaiting customer claim or staff verification. */
export function isPaymentReviewStatus(status: string | null | undefined): boolean {
  return status != null && PAYMENT_REVIEW.has(status);
}
