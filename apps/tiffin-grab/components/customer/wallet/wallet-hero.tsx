"use client";

import { Card } from "@/components/ds";
import { AnimatedNumber, Lottie } from "@/components/motion";

export function WalletHero({ coins, money, currency }: { coins: number; money: number | null; currency: string }) {
  // Money is display-only; format with the app's actual currency symbol
  // (₹ for INR, $ for USD/CAD, …) — never a hardcoded "$".
  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" });
  return (
    <Card variant="flat" className="flex items-center gap-3 p-4">
      <Lottie src="/lottie/coin-burst.json" mode="loop" className="size-16" />
      <div>
        <p className="text-2xl font-semibold">
          <AnimatedNumber value={coins} /> coins
        </p>
        {money != null && (
          <p className="text-muted-foreground text-sm">
            <AnimatedNumber value={money} format={(n) => `≈ ${fmt.format(n)}`} />
          </p>
        )}
      </div>
    </Card>
  );
}
