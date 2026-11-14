import { coinsFor } from "@foundry/wallet";
import { inStatuses, PAID } from "@/lib/payments/status";

/**
 * Coins a paid order earns: `pct`% of what was paid before tax, converted at
 * the coin value. Shared by the checkout preview and the real award so the two
 * can never disagree.
 */
export function earnCoins(input: { total: number; taxTotal: number; pct: number; valuePerCoin: number | null }): number {
  const { total, taxTotal, pct, valuePerCoin } = input;
  const base = total - taxTotal;
  if (pct <= 0 || !valuePerCoin || valuePerCoin <= 0 || base <= 0) return 0;
  return coinsFor((base * pct) / 100, valuePerCoin);
}

/** The award's cap rule: an award that would take the wallet past the cap is skipped whole, not trimmed. */
export function coinsUnderCap(input: { coins: number; balance: number; cap: number | null }): number {
  return input.cap !== null && input.balance + input.coins > input.cap ? 0 : input.coins;
}

/**
 * Coins are earned only when money actually changed hands: the order cost
 * something and its payment is settled. A $0 order (covered by coins or a
 * coupon) earns nothing, and neither does one still waiting on payment.
 * "simulated_paid" counts as paid: it is the no-payment-rail checkout path.
 */
export function earnsOrderCoins(input: { total: string | number; paymentStatus: string | null }): boolean {
  const total = Number(input.total);
  if (!Number.isFinite(total) || total <= 0) return false;
  return inStatuses(PAID, input.paymentStatus);
}
