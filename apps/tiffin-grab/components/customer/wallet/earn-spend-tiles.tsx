"use client";

import { Card } from "@/components/ds";
import { AnimatedNumber } from "@/components/motion";

export function EarnSpendTiles({ earned, spent }: { earned: number; spent: number }) {
  return (
    <div className="grid h-full grid-cols-2 gap-3">
      <Card variant="flat" className="flex flex-col justify-center p-4 md:p-5">
        <p className="text-muted-foreground text-xs">Earned</p>
        <p className="text-ok text-xl font-semibold tabular-nums md:text-2xl">
          <AnimatedNumber value={earned} />
        </p>
      </Card>
      <Card variant="flat" className="flex flex-col justify-center p-4 md:p-5">
        <p className="text-muted-foreground text-xs">Spent</p>
        <p className="text-bad text-xl font-semibold tabular-nums md:text-2xl">
          <AnimatedNumber value={spent} />
        </p>
      </Card>
    </div>
  );
}
