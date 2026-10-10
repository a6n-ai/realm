"use client";

import { InboxIcon, ReceiptTextIcon, ScrollTextIcon, ActivityIcon } from "lucide-react";
import { DatedTabNav } from "@/components/filters/dated-tab-nav";

const TABS = [
  { label: "E-transfer", href: "/dashboard/payments/requests", icon: InboxIcon },
  { label: "All payments", href: "/dashboard/payments/all", icon: ReceiptTextIcon },
  { label: "Ledger", href: "/dashboard/payments/ledger", icon: ScrollTextIcon },
  { label: "Provider logs", href: "/dashboard/payments/logs", icon: ActivityIcon },
] as const;

export function PaymentsTabs() {
  return <DatedTabNav tabs={TABS} ariaLabel="Payments" />;
}
