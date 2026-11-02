"use client";

import { BanknoteIcon, CoinsIcon, GiftIcon, ScrollTextIcon, WalletIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";

const SUBTABS = [
  { label: "Ledger", href: "/dashboard/wallet/ledger", icon: ScrollTextIcon },
  { label: "Balances", href: "/dashboard/wallet/balances", icon: WalletIcon },
  { label: "Settings", href: "/dashboard/wallet/settings", icon: CoinsIcon },
  { label: "Give coins", href: "/dashboard/wallet/give", icon: BanknoteIcon },
  { label: "Referrals", href: "/dashboard/wallet/referrals", icon: GiftIcon },
] as const;

export function WalletTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Wallet settings" />;
}
