"use client";

import { InboxIcon, ReceiptTextIcon, ScrollTextIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";

const TABS = [
  { label: "Pending verification", href: "/dashboard/payments/requests", icon: InboxIcon },
  { label: "All payments", href: "/dashboard/payments/all", icon: ReceiptTextIcon },
  { label: "Ledger", href: "/dashboard/payments/ledger", icon: ScrollTextIcon },
] as const;

export function PaymentsTabs() {
  return <RoutedTabNav tabs={TABS} ariaLabel="Payments" />;
}
