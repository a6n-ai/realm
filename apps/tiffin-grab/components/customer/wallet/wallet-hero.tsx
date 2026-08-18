"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@realm/ui/cn";
import { Card } from "@/components/ds";
import { AnimatedNumber, Lottie } from "@/components/motion";

export function WalletHero({
  coins,
  money,
  currency,
  lowBalanceThreshold = 20,
}: {
  coins: number;
  money: number | null;
  currency: string;
  /** Below this (inclusive of 0), the card gets a soft orange glow so a low balance is
   * visible without a separate alert. There's no existing app-wide "low balance" concept
   * to key off yet, so this is a reasonable starting default — easy to retune once there's
   * real usage data on typical balances/redemption sizes. */
  lowBalanceThreshold?: number;
}) {
  // Money is display-only; format with the app's actual currency symbol
  // (₹ for INR, $ for USD/CAD, …) — never a hardcoded "$".
  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" });

  // No customer-initiated top-up flow exists in the app today — coins only ever change via
  // admin payouts/awards landing between page loads/revalidations. So "funds were added" is
  // detected the only way it can be: this render's balance is higher than the last one this
  // component actually saw, not a submit-triggered event. `useRef` (not state) so the compare
  // doesn't itself cause a re-render, and it starts at the initial value so a fresh page load
  // is never mistaken for a celebration.
  const prevCoins = useRef(coins);
  const [celebrating, setCelebrating] = useState(false);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (coins > prevCoins.current) {
      setCelebrating(true);
      setBurstKey((k) => k + 1);
      const timer = setTimeout(() => setCelebrating(false), 1600);
      prevCoins.current = coins;
      return () => clearTimeout(timer);
    }
    prevCoins.current = coins;
  }, [coins]);

  const isLow = coins < lowBalanceThreshold;

  return (
    <Card
      variant="flat"
      className={cn(
        "relative flex h-full items-center gap-3 overflow-hidden p-4 transition-shadow duration-300 md:gap-4 md:p-5",
        isLow && "ring-warn/50 shadow-[0_0_28px_-6px_var(--warn)] ring-2",
      )}
    >
      <Lottie src="/lottie/coin-burst.json" mode="loop" className="size-16 shrink-0 md:size-20" />
      {celebrating ? (
        // Keyed remount replays the "once" clip from frame 0 every time funds land, on top
        // of the ambient loop already playing — a brief, one-shot emphasis, not a swap.
        <Lottie
          key={burstKey}
          src="/lottie/coin-burst.json"
          mode="once"
          label="Funds added"
          className="pointer-events-none absolute inset-0 scale-150"
        />
      ) : null}
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold tabular-nums transition-colors duration-300 md:text-3xl", isLow && "text-warn")}>
          <AnimatedNumber value={coins} /> coins
        </p>
        {money != null && (
          <p className="text-muted-foreground text-sm tabular-nums">
            <AnimatedNumber value={money} format={(n) => `≈ ${fmt.format(n)}`} />
          </p>
        )}
        {isLow && <p className="text-warn mt-1 text-xs font-medium">Running low — top up to keep ordering smoothly.</p>}
      </div>
    </Card>
  );
}
