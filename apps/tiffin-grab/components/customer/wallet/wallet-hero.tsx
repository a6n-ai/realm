"use client";

import { Card } from "@/components/ds";
import { AnimatedNumber, Lottie } from "@/components/motion";

export function WalletHero({ coins, money, currency }: { coins: number; money: number | null; currency: string }) {
  // Money is display-only; format with the app's actual currency symbol
  // (₹ for INR, $ for USD/CAD, …) — never a hardcoded "$".
  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" });
  return (
    <Card variant="flat" className="flex h-full items-center gap-3 p-4 md:gap-4 md:p-5">
      <Lottie src="/lottie/coin-burst.json" mode="loop" className="size-16 shrink-0 md:size-20" />
      <div className="min-w-0">
        <p className="text-2xl font-semibold tabular-nums md:text-3xl">
          <AnimatedNumber value={coins} /> coins
        </p>
        {money != null && (
          <p className="text-muted-foreground text-sm tabular-nums">
            <AnimatedNumber value={money} format={(n) => `≈ ${fmt.format(n)}`} />
          </p>
        )}
      </div>
    </Card>
  );
}
