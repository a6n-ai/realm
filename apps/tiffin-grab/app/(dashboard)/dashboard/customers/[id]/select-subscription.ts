// Which of a customer's orders the subscription panel shows. Pure, so the precedence
// rules are testable without rendering the page.

const LIVE = new Set(["active", "paused"]);

/**
 * Precedence: an explicit ?order= wins, then the newest live subscription, then the
 * newest order of any status. Callers pass orders newest-first (getCustomer360 orders
 * by createdAt desc), so "newest" is just the first match.
 *
 * An `orderParam` naming an order this customer does not own falls through to the
 * default rather than throwing — it is a stale link, not an authorization boundary
 * (the panel re-reads the order and staff already passed requireStaff).
 */
export function selectSubscription<T extends { publicId: string; status: string }>(
  orders: readonly T[],
  orderParam?: string,
): T | null {
  if (orders.length === 0) return null;
  const requested = orderParam ? orders.find((o) => o.publicId === orderParam) : undefined;
  return requested ?? orders.find((o) => LIVE.has(o.status)) ?? orders[0];
}
