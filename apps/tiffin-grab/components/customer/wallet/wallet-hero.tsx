"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Coins } from "lucide-react";
import { IconTile, StatGroup, StatTile } from "@/components/customer/kit";
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
    <div className="flex flex-col gap-3">
      <StatGroup>
        <StatTile bare icon={<IconTile tint="brown"><Coins /></IconTile>} label="Coins" value={<AnimatedNumber value={coins} />} worth={money != null ? fmt.format(money) : null} />
        <StatTile bare icon={<IconTile tint="teal"><ArrowDownLeft /></IconTile>} label="Earned" value={earned} />
        <StatTile bare icon={<IconTile tint="indigo"><ArrowUpRight /></IconTile>} label="Used" value={spent} />
      </StatGroup>
      {coins === 0 && earnPct > 0 && (
        <p className="c-caption px-1 text-pretty">
          Earn {earnPct}% back as coins on every paid order
          {coinWorth != null ? `; each coin is worth ${fmt.format(coinWorth)}` : ""}.{" "}
          <Link href="/me/refer" className="text-[var(--primary-text,var(--primary))] inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
            Refer a friend
          </Link>
        </p>
      )}
    </div>
  );
}
