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
 * a pause is day-level, not a plan tag.
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

/**
 * Why a plan can't get a complimentary tiffin, or null when it can: only a running or finished
 * plan whose money is settled. WordPress-imported plans carry no payment rows (paid in
 * WordPress), so "no payment yet" alone is not a blocker; a payment still in review is.
 */
export function complimentaryBlocker(orderStatus: string, paymentStatuses: readonly string[]): string | null {
  if (orderStatus !== "active" && orderStatus !== "completed") return "Only an active plan or one that is over can get a complimentary tiffin";
  if (paymentStatuses.some((s) => PAYMENT_REVIEW.has(s))) return "Payment is still pending on this plan. Confirm it first.";
  if (paymentStatuses.length > 0 && paymentStatuses.every((s) => s === PAYMENT_REJECTED_STATUS)) return "This plan's payment was rejected";
  return null;
}

/**
 * Why add-on money can't be recorded on a plan, or null when it can. The add-on payment is
 * written as settled, and fulfillmentReadyOrder() treats any settled payment as "plan is paid",
 * so it must never be the first settled money on a plan that was rejected or never paid.
 * A WordPress-imported plan (`wc-`) was prepaid there and carries no payment rows.
 */
export function canTakeAddonPayment(
  order: { deploymentId: string },
  rows: readonly { status: string; addonRequest?: unknown; expiresAt?: number | null }[],
  now = Date.now(),
): string | null {
  // An add-on link past its expiry can no longer be paid, so it neither blocks nor counts.
  const live = rows.filter((r) => !(r.addonRequest != null && r.expiresAt != null && r.expiresAt <= now));
  if (live.some((r) => r.addonRequest != null && (PAYMENT_REVIEW.has(r.status) || r.status === PAYMENT_REJECTED_STATUS))) {
    return "Regenerate or cancel the existing link first";
  }
  const paymentStatuses = live.map((r) => r.status);
  if (paymentStatuses.some((s) => PAYMENT_REVIEW.has(s) || s === "pending")) return "A payment is still pending on this plan. Confirm it first.";
  if (paymentStatuses.includes(PAYMENT_REJECTED_STATUS)) return "This plan's payment was rejected. Settle the plan before adding add-ons.";
  if (paymentStatuses.some((s) => PAYMENT_SETTLED.has(s))) return null;
  if (paymentStatuses.length === 0 && order.deploymentId.startsWith("wc-")) return null;
  return "This plan has no confirmed payment yet.";
}
