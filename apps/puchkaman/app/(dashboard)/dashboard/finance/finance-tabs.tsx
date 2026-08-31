"use client";

import { CreditCardIcon, ScrollTextIcon } from "lucide-react";
import { RoutedTabNav } from "@realm/design-system";

const SUBTABS = [
  { label: "Transactions", href: "/dashboard/finance/transactions", icon: CreditCardIcon },
  { label: "Ledger", href: "/dashboard/finance/ledger", icon: ScrollTextIcon },
] as const;

export function FinanceTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Finance sections" />;
}
