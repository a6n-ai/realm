"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { HeaderTooltip } from "./header-tooltip";

/** Header wallet chip — the quick path to Finances (/me/wallet). */
export function CoinChip({ balance }: { balance: number | string }) {
  const pathname = usePathname();
  const active = pathname === "/me/wallet" || pathname.startsWith("/me/wallet/");
  return (
    <HeaderTooltip label="Finances">
      <Link
        href="/me/wallet"
        aria-current={active ? "page" : undefined}
        aria-label={`Finances, ${balance} coins`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-transform duration-100 active:scale-[0.97]",
          active
            ? "border-primary bg-secondary text-secondary-foreground"
            : "border-border bg-card text-foreground hover:bg-secondary/60",
        )}
      >
        <WalletIcon aria-hidden className="text-primary size-4" />
        {balance}
      </Link>
    </HeaderTooltip>
  );
}
