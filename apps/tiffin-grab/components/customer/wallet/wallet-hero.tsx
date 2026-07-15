"use client";

import { Card } from "@/components/ds";
import { AnimatedNumber, Lottie } from "@/components/motion";

export function WalletHero({ coins, money }: { coins: number; money: number | null }) {
  return (
    <Card variant="flat" className="flex items-center gap-3 p-4">
      <Lottie src="/lottie/coin-burst.json" mode="loop" className="size-16" />
      <div>
        <p className="text-2xl font-semibold">
          <AnimatedNumber value={coins} /> coins
        </p>
        {money != null && (
          <p className="text-muted-foreground text-sm">
            <AnimatedNumber value={money} format={(n) => ` ≈ $${n.toFixed(2)}`} />
          </p>
        )}
      </div>
    </Card>
  );
}
