"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/customer/kit";
import { AnimatedNumber, Lottie } from "@/components/motion";

export function WalletHero({
  coins,
  money,
  currency,
  earned = 0,
  spent = 0,
  earnPct = 0,
  coinWorth = null,
}: {
  coins: number;
  money: number | null;
  currency: string;
  earned?: number;
  spent?: number;
  /** Live earn rate (% of a paid order back as coins) and one coin's money value, both from settings. */
  earnPct?: number;
  coinWorth?: number | null;
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

  return (
    <Card className="relative flex items-center gap-3 overflow-hidden p-4 md:gap-4 md:p-5">
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
        <p className="text-2xl font-bold tabular-nums md:text-3xl">
          <AnimatedNumber value={coins} /> coins
        </p>
        {money != null && (
          <p className="text-muted-foreground text-sm tabular-nums">
            <AnimatedNumber value={money} format={(n) => `≈ ${fmt.format(n)}`} />
          </p>
        )}
        <p className="c-caption nums mt-1">
          Earned {earned} · Spent {spent}
        </p>
        {coins === 0 && earnPct > 0 && (
          <p className="c-caption mt-2 text-pretty">
            Earn {earnPct}% back as coins on every paid order
            {coinWorth != null ? `; each coin is worth ${fmt.format(coinWorth)}` : ""}.{" "}
            <Link href="/me/refer" className="text-[var(--primary-text,var(--primary))] inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
              Refer a friend
            </Link>
          </p>
        )}
      </div>
    </Card>
  );
}
