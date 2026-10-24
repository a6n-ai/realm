"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { Card } from "@/components/customer/kit";
import { AnimatedNumber } from "@/components/motion";

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

  return (
    <Card className="flex items-center gap-3 p-4 md:gap-4 md:p-5">
      <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--primary-wash,#FBE3D2)] text-[var(--primary)] md:size-16">
        <Coins className="size-7 md:size-8" />
      </span>
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
