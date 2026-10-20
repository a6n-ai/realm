/**
 * Coins a paid order earns: `pct`% of what was paid before tax, converted at
 * the coin value. Shared by the checkout preview and the real award so the two
 * can never disagree.
 */
export function earnCoins(input: { total: number; taxTotal: number; pct: number; valuePerCoin: number | null }): number {
  const { total, taxTotal, pct, valuePerCoin } = input;
  const base = total - taxTotal;
  if (pct <= 0 || !valuePerCoin || valuePerCoin <= 0 || base <= 0) return 0;
  // Same epsilon as foundry's capRedemption: 30 × 10% ÷ 0.1 is 29.999… in floats.
  return Math.floor((base * pct) / 100 / valuePerCoin + 1e-9);
}

/** The award's cap rule: an award that would take the wallet past the cap is skipped whole, not trimmed. */
export function coinsUnderCap(input: { coins: number; balance: number; cap: number | null }): number {
  return input.cap !== null && input.balance + input.coins > input.cap ? 0 : input.coins;
}
