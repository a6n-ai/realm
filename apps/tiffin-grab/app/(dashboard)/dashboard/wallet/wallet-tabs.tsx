import { BanknoteIcon, CoinsIcon, ScrollTextIcon } from "lucide-react";
import { RoutedTabNav } from "@realm/design-system";

const SUBTABS = [
  { label: "Ledger", href: "/dashboard/wallet/ledger", icon: ScrollTextIcon },
  { label: "Payouts", href: "/dashboard/wallet/payouts", icon: BanknoteIcon },
  { label: "Coin rate", href: "/dashboard/wallet/coin-rate", icon: CoinsIcon },
] as const;

export function WalletTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Wallet settings" />;
}
