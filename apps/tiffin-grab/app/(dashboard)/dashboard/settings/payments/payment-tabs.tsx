"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCardIcon, type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";
import { findPaymentProvider } from "@realm/payments";

export type PaymentTab = {
  id: string;
  label: string;
};

function methodHref(id: string) {
  return `/dashboard/settings/payments/${id}`;
}

function methodIcon(id: string): LucideIcon {
  return findPaymentProvider(id)?.icon ?? CreditCardIcon;
}

/** Routed sub-tabs (wallet-style) — one tab per installed payment method. */
export function PaymentTabs({ methods }: { methods: PaymentTab[] }) {
  const pathname = usePathname();
  if (methods.length === 0) return null;

  const active =
    methods.find((m) => pathname === methodHref(m.id) || pathname.startsWith(`${methodHref(m.id)}/`))
      ?.id ?? methods[0]?.id ?? "";

  return (
    <Tabs value={active}>
      <TabsList aria-label="Payment methods">
        {methods.map((m) => {
          const Icon = methodIcon(m.id);
          return (
            <TabsTrigger key={m.id} value={m.id} asChild>
              <Link href={methodHref(m.id)}>
                <Icon />
                {m.label}
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
