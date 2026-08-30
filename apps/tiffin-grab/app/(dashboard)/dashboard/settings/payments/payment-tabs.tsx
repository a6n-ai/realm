import Link from "next/link";
import { CreditCardIcon, PlusIcon, type LucideIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { RoutedTabNav } from "@realm/design-system";
import { PAYMENT_PROVIDERS, findPaymentProvider } from "@realm/payments/providers";

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
  if (methods.length === 0) return null;

  const tabs = methods.map((m) => ({ href: methodHref(m.id), label: m.label, icon: methodIcon(m.id) }));
  const hasMoreToAdd = methods.length < PAYMENT_PROVIDERS.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <RoutedTabNav tabs={tabs} ariaLabel="Payment methods" />
      {hasMoreToAdd && (
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/dashboard/settings/payments/add">
            <PlusIcon className="size-3.5" />
            Add provider
          </Link>
        </Button>
      )}
    </div>
  );
}
