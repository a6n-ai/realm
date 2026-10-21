"use client";

import { BanknoteIcon, CoinsIcon, ScrollTextIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";

const SUBTABS = [
  { label: "Ledger", href: "/dashboard/wallet/ledger", icon: ScrollTextIcon },
  { label: "Settings", href: "/dashboard/wallet/settings", icon: CoinsIcon },
  { label: "Give coins", href: "/dashboard/wallet/give", icon: BanknoteIcon },
] as const;

export function WalletTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Wallet settings" />;
}
