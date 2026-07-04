"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BanknoteIcon, CoinsIcon, ScrollTextIcon, type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";

type SubTab = { label: string; href: string; icon: LucideIcon };

const SUBTABS: SubTab[] = [
  { label: "Ledger", href: "/dashboard/wallet/ledger", icon: ScrollTextIcon },
  { label: "Payouts", href: "/dashboard/wallet/payouts", icon: BanknoteIcon },
  { label: "Coin rate", href: "/dashboard/wallet/coin-rate", icon: CoinsIcon },
];

// Routed sub-tabs styled with the shared shadcn Tabs. Each trigger is a real
// Link (asChild) so every sub-section keeps its own URL; the active tab is
// derived from the pathname rather than local Tabs state.
export function WalletTabs() {
  const pathname = usePathname();
  const active = SUBTABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? "";

  return (
    <Tabs value={active}>
      <TabsList aria-label="Wallet settings">
        {SUBTABS.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={tab.href}>
              <tab.icon />
              {tab.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
