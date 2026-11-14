import { PAID, PENDING, REJECTED, inStatuses } from "@/lib/payments/status";

/** Order statuses where payment overlays replace the green “Active” badge. */
const OVERLAY_ORDER = new Set(["active", "pending", "paused"]);

/**
 * Shared admin + customer badge vocabulary:
 * Payment review → Rejected → Active → Completed (plus waitlisted/cancelled when those rows appear).
 *
 * DB `orders.status` can stay `active` while e-Transfer is unpaid so deliveries materialize early; the badge must
 * not look settled until money is verified. `paused` maps to Active: a pause is day-level, not a plan tag.
 */
export function orderDisplayStatus(
  orderStatus: string,
  paymentStatuses: readonly (string | null | undefined)[],
): string {
  const statuses = paymentStatuses.filter((s): s is string => s != null);
  const needsReview = statuses.some((s) => inStatuses(PENDING, s));
  if (needsReview && OVERLAY_ORDER.has(orderStatus)) return "payment_review";

  const rejectedOnly =
    statuses.some((s) => s === REJECTED) &&
    !statuses.some((s) => inStatuses(PAID, s)) &&
    !needsReview;
  if (rejectedOnly && OVERLAY_ORDER.has(orderStatus)) return "rejected";

  // Plan-level pause is not part of the shared tag set — treat as Active when settled.
  if (orderStatus === "paused") return "active";

  return orderStatus;
}

/** True when payment is still awaiting customer claim or staff verification. */
export function isPaymentReviewStatus(status: string | null | undefined): boolean {
  return inStatuses(PENDING, status);
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
  if (paymentStatuses.some((s) => inStatuses(PENDING, s))) return "Payment is still pending on this plan. Confirm it first.";
  if (paymentStatuses.length > 0 && paymentStatuses.every((s) => s === REJECTED)) return "This plan's payment was rejected";
  return null;
}
