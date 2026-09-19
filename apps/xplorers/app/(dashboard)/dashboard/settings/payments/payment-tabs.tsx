"use client";

import { CreditCardIcon, type LucideIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";
import { PAYMENT_PROVIDERS, findPaymentProvider } from "@foundry/payments/providers";

function methodIcon(id: string): LucideIcon {
  return findPaymentProvider(id)?.icon ?? CreditCardIcon;
}

export function PaymentTabs() {
  const tabs = PAYMENT_PROVIDERS.map((p) => ({
    href: `/dashboard/settings/payments/${p.id}`,
    label: p.label,
    icon: methodIcon(p.id),
  }));

  return <RoutedTabNav tabs={tabs} ariaLabel="Payment methods" />;
}
