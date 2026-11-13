"use client";

import { CreditCardIcon, InboxIcon, ReceiptTextIcon, ScrollTextIcon, ActivityIcon } from "lucide-react";
import { DatedTabNav } from "@/components/filters/dated-tab-nav";
import { PAYMENTS_TABS } from "@/lib/list/payments-drill";

const ICON = { requests: InboxIcon, stripe: CreditCardIcon, all: ReceiptTextIcon, ledger: ScrollTextIcon, logs: ActivityIcon };
const TABS = PAYMENTS_TABS.map((t) => ({ label: t.label, href: t.href, icon: ICON[t.key] }));

export function PaymentsTabs() {
  return <DatedTabNav tabs={TABS} ariaLabel="Payments" />;
}
