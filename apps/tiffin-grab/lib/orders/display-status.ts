/** Payment statuses that mean staff still needs to confirm money before the plan is “fully on”. */
export const PAYMENT_REVIEW_STATUSES = ["awaiting_payment", "pending_verification"] as const;

/** Money confirmed — kitchen packing and OptimoRoute may fulfill. */
export const PAYMENT_SETTLED_STATUSES = ["paid", "simulated_paid"] as const;

/** Staff rejected the claim; customer must start a new order (hidden from /me lists). */
export const PAYMENT_REJECTED_STATUS = "rejected" as const;

const PAYMENT_REVIEW = new Set<string>(PAYMENT_REVIEW_STATUSES);
const PAYMENT_SETTLED = new Set<string>(PAYMENT_SETTLED_STATUSES);

/** Order statuses where payment overlays replace the green “Active” badge. */
const OVERLAY_ORDER = new Set(["active", "pending", "paused"]);

/**
 * Shared admin + customer badge vocabulary:
 * Payment review → Rejected → Active → Completed (plus waitlisted/cancelled when those rows appear).
 *
 * DB `orders.status` can stay `active` while e-Transfer is unpaid so deliveries materialize
 * early; the UI must not look settled until money is verified. `paused` maps to Active —
 * vacation is day-level, not a plan tag.
 */
export function orderDisplayStatus(
  orderStatus: string,
  paymentStatuses: readonly (string | null | undefined)[],
): string {
  const statuses = paymentStatuses.filter((s): s is string => s != null);
  const needsReview = statuses.some((s) => PAYMENT_REVIEW.has(s));
  if (needsReview && OVERLAY_ORDER.has(orderStatus)) return "payment_review";

  const rejectedOnly =
    statuses.some((s) => s === PAYMENT_REJECTED_STATUS) &&
    !statuses.some((s) => PAYMENT_SETTLED.has(s)) &&
    !needsReview;
  if (rejectedOnly && OVERLAY_ORDER.has(orderStatus)) return "rejected";

  // Plan-level pause is not part of the shared tag set — treat as Active when settled.
  if (orderStatus === "paused") return "active";
  // Future-dated active plans still read as Active (window copy handles "Starts …").
  if (orderStatus === "upcoming") return "active";

  return orderStatus;
}

/** True when payment is still awaiting customer claim or staff verification. */
export function isPaymentReviewStatus(status: string | null | undefined): boolean {
  return status != null && PAYMENT_REVIEW.has(status);
}

/**
 * Customer /me lists hide plans whose money was rejected and never settled or re-queued.
 * Admin keeps seeing them with the Rejected badge.
 */
export function isHiddenFromCustomer(
  paymentStatuses: readonly (string | null | undefined)[],
): boolean {
  return orderDisplayStatus("active", paymentStatuses) === "rejected";
}
