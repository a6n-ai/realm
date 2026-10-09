"use client";

import { CreditCardIcon, InboxIcon, ReceiptTextIcon, ScrollTextIcon, ActivityIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";

const TABS = [
  { label: "E-transfer", href: "/dashboard/payments/requests", icon: InboxIcon },
  { label: "Stripe", href: "/dashboard/payments/stripe", icon: CreditCardIcon },
  { label: "All payments", href: "/dashboard/payments/all", icon: ReceiptTextIcon },
  { label: "Ledger", href: "/dashboard/payments/ledger", icon: ScrollTextIcon },
  { label: "Provider logs", href: "/dashboard/payments/logs", icon: ActivityIcon },
] as const;

export function PaymentsTabs() {
  return <RoutedTabNav tabs={TABS} ariaLabel="Payments" />;
}
