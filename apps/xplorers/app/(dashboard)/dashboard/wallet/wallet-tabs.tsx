"use client";

import { CoinsIcon, ScrollTextIcon, SlidersHorizontalIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";

const SUBTABS = [
  { label: "Payouts", href: "/dashboard/wallet/payouts", icon: SlidersHorizontalIcon },
  { label: "Coin rate", href: "/dashboard/wallet/coin-rate", icon: CoinsIcon },
  { label: "Ledger", href: "/dashboard/wallet/ledger", icon: ScrollTextIcon },
] as const;

export function WalletTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Wallet" />;
}
