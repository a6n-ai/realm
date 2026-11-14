import { PAID, PENDING, REJECTED, inStatuses } from "@/lib/payments/status";
import { isWordpressImport } from "./wordpress-import";

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
  // An add-on link past its expiry can't be paid, so it neither blocks nor counts.
  const live = rows.filter((r) => !(r.addonRequest != null && r.expiresAt != null && r.expiresAt <= now));
  if (live.some((r) => r.addonRequest != null && (inStatuses(PENDING, r.status) || r.status === REJECTED))) {
    return "Regenerate or cancel the existing link first";
  }
  const paymentStatuses = live.map((r) => r.status);
  if (paymentStatuses.some((s) => inStatuses(PENDING, s) || s === "pending")) return "A payment is still pending on this plan. Confirm it first.";
  if (paymentStatuses.includes(REJECTED)) return "This plan's payment was rejected. Settle the plan before adding add-ons.";
  if (paymentStatuses.some((s) => inStatuses(PAID, s))) return null;
  if (paymentStatuses.length === 0 && isWordpressImport(order)) return null;
  return "This plan has no confirmed payment yet.";
}
