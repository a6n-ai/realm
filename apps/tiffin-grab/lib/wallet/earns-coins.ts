/**
 * Coins are earned only when money actually changed hands: the order cost
 * something and its payment is settled. A $0 order (covered by coins or a
 * coupon) earns nothing, and neither does one still waiting on payment.
 * "simulated_paid" counts as paid: it is the no-payment-rail checkout path.
 */
export function earnsOrderCoins(input: { total: string | number; paymentStatus: string | null }): boolean {
  const total = Number(input.total);
  if (!Number.isFinite(total) || total <= 0) return false;
  return input.paymentStatus === "paid" || input.paymentStatus === "simulated_paid";
}
