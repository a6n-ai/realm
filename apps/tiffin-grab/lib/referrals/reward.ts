import { earnCoins } from "@/lib/wallet/earn-coins";

/** Coins one side of a referral earns on the friend's first paid order. */
export function referralCoins(input: { mode: "flat" | "pct"; value: number; total: number; taxTotal: number; valuePerCoin: number | null }): number {
  if (input.value <= 0) return 0;
  if (input.mode === "flat") return input.value;
  return earnCoins({ total: input.total, taxTotal: input.taxTotal, pct: input.value, valuePerCoin: input.valuePerCoin });
}
