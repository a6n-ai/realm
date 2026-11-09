import { round2 } from "@foundry/commons/util/money";
import { coinsFor } from "@foundry/wallet";

export type CoinCapQuote = {
  /** Largest currency value coins may cover on this order. */
  maxValue: number;
  /** Largest coin count that value corresponds to, never above the balance. */
  maxCoins: number;
  /** Which limit bound the answer — drives the "why not more" message. */
  limitedBy: "balance" | "admin_pct" | "order_total" | "wallet_pct" | "none";
};

/** The two ceilings on coin redemption, in currency (share of subtotal) and coins (share of balance). */
export function coinLimits(args: { subtotal: number; balance: number; maxPct: number | null; maxRedeemPctOfBalance: number | null }) {
  return {
    pctCap: args.maxPct == null ? Infinity : round2(args.subtotal * (args.maxPct / 100)),
    walletPctCap: args.maxRedeemPctOfBalance == null ? Infinity : Math.floor(args.balance * (args.maxRedeemPctOfBalance / 100)),
  };
}

/**
 * The one definition of "how many coins can this order take", shared by
 * createOrder (enforcement) and checkout (explanation), so the number a customer
 * is shown is the number the server will accept.
 *
 * The admin percentage applies to the PRE-TAX, PRE-DISCOUNT subtotal: coins are a
 * discount, discounts apply before tax, and anchoring on the raw subtotal keeps
 * the cap from shifting as coupons are added or with the customer's province.
 * `remaining` (subtotal minus other discounts) still bounds it, so coins can
 * never push an order below zero.
 */
export function quoteCoinCap(args: {
  subtotal: number;
  remaining: number;
  balance: number;
  rate: number;
  maxPct: number | null;
  maxRedeemPctOfBalance: number | null;
}): CoinCapQuote {
  const { subtotal, remaining, balance, rate, maxPct, maxRedeemPctOfBalance } = args;
  if (rate <= 0 || balance <= 0 || remaining <= 0) {
    return { maxValue: 0, maxCoins: 0, limitedBy: balance <= 0 ? "balance" : "order_total" };
  }

  const { pctCap, walletPctCap } = coinLimits({ subtotal, balance, maxPct, maxRedeemPctOfBalance });
  const valueCap = Math.min(remaining, pctCap);
  // Floor so the customer is never offered a coin count worth a cent more than the cap.
  const rawCoinsForCap = coinsFor(valueCap, rate);
  const coinsForCap = Math.min(rawCoinsForCap, walletPctCap);

  if (balance <= coinsForCap) {
    return { maxValue: round2(balance * rate), maxCoins: balance, limitedBy: "balance" };
  }
  return {
    maxValue: round2(coinsForCap * rate),
    maxCoins: coinsForCap,
    limitedBy: walletPctCap < rawCoinsForCap ? "wallet_pct" : pctCap < remaining ? "admin_pct" : "order_total",
  };
}

/** Customer-facing explanation for why not every coin can be applied. */
export function coinCapMessage(q: CoinCapQuote, args: { balance: number; maxPct: number | null; maxRedeemPctOfBalance: number | null }): string | null {
  const unused = args.balance - q.maxCoins;
  if (unused <= 0) return null;
  const coinWord = (n: number) => `${n} ${n === 1 ? "coin" : "coins"}`;
  switch (q.limitedBy) {
    case "wallet_pct":
      return `You can redeem up to ${args.maxRedeemPctOfBalance}% of your total coin balance per order. The other ${coinWord(unused)} stay in your wallet.`;
    case "admin_pct":
      return `Coins can cover up to ${args.maxPct}% of your order subtotal, so you can use ${coinWord(q.maxCoins)} here. The other ${coinWord(unused)} stay in your wallet.`;
    case "order_total":
      return `Your order only needs ${coinWord(q.maxCoins)} to be fully covered. The other ${coinWord(unused)} stay in your wallet.`;
    default:
      return null;
  }
}
