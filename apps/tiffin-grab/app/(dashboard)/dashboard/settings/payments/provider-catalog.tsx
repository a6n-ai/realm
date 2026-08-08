"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { IntegrationPluginCard, IntegrationPluginCardSkeleton } from "@realm/crm";
import { Button } from "@realm/ui/button";
import { PAYMENT_PROVIDERS } from "@realm/payments/providers";
import { installPaymentPlugin } from "./actions";

/**
 * The install surface for Settings → Payment once the Payments plugin itself
 * is installed but has zero providers configured. Mirrors the deleted
 * Integrations plugin cards (git show 7af0ea7), reusing the same
 * IntegrationPluginCard chrome, but scoped to PAYMENT_PROVIDERS and wired to
 * the payments actions instead of a per-provider Integrations entry.
 */
export function ProviderCatalog({ blockedPluginIds }: { blockedPluginIds: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const install = (id: string, label: string) =>
    start(async () => {
      try {
        await installPaymentPlugin(id);
        toast.success(`${label} installed`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not install provider");
      }
    });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PAYMENT_PROVIDERS.map((provider) => {
        const blocked = provider.requiresPlugin
          ? blockedPluginIds.includes(provider.requiresPlugin)
          : false;
        return (
          <IntegrationPluginCard
            key={provider.id}
            icon={<provider.icon className="size-5" />}
            label={provider.label}
            description={
              blocked
                ? `${provider.description} Install ${provider.requiresPlugin} first.`
                : provider.description
            }
          >
            <Button
              type="button"
              size="sm"
              className="gap-1.5 self-start"
              disabled={pending || blocked}
              onClick={() => install(provider.id, provider.label)}
            >
              <PlusIcon className="size-3.5" />
              Add provider
            </Button>
          </IntegrationPluginCard>
        );
      })}
    </div>
  );
}

export function ProviderCatalogSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PAYMENT_PROVIDERS.map((p) => (
        <IntegrationPluginCardSkeleton key={p.id} />
      ))}
    </div>
  );
}
