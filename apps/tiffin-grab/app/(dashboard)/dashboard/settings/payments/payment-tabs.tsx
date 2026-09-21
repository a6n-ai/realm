"use client";

import Link from "next/link";
import { BanknoteIcon, PlusIcon, type LucideIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { RoutedTabNav } from "@foundry/design-system";
import { PAYMENT_PROVIDERS, findPaymentProvider } from "@foundry/payments/providers";

export type PaymentTab = {
  id: string;
  label: string;
};

const CATALOG_IDS = new Set(["cash", "etransfer"]);

function methodHref(id: string) {
  return `/dashboard/settings/payments/${id}`;
}

function methodIcon(id: string): LucideIcon {
  return findPaymentProvider(id)?.icon ?? BanknoteIcon;
}

function catalogProviders() {
  return PAYMENT_PROVIDERS.filter((p) => CATALOG_IDS.has(p.id));
}

/** Routed sub-tabs — cash and e-Transfer only. Card/Stripe is not a method tab. */
export function PaymentTabs({ methods }: { methods: PaymentTab[] }) {
  const catalog = catalogProviders();
  const visible = catalog
    .map((p) => methods.find((m) => m.id === p.id))
    .filter((m): m is PaymentTab => Boolean(m));
  if (visible.length === 0) return null;

  const tabs = visible.map((m) => ({ href: methodHref(m.id), label: m.label, icon: methodIcon(m.id) }));
  const hasMoreToAdd = catalog.some((p) => !methods.some((m) => m.id === p.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <RoutedTabNav tabs={tabs} ariaLabel="Payment methods" />
      {hasMoreToAdd && (
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/dashboard/settings/payments/add" prefetch={false}>
            <PlusIcon className="size-3.5" />
            Add provider
          </Link>
        </Button>
      )}
    </div>
  );
}
