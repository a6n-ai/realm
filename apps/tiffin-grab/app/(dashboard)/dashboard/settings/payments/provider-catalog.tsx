"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { IntegrationPluginCard, IntegrationPluginCardSkeleton } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import { PAYMENT_PROVIDERS } from "@foundry/payments/providers";
import { installPaymentPlugin } from "./actions";
import { setPluginInstalledAction } from "../integrations/actions";

/**
 * The install surface for Settings → Payment: every PAYMENT_PROVIDERS entry
 * not already installed, regardless of how many are. Mirrors the deleted
 * Integrations plugin cards (git show 7af0ea7), reusing the same
 * IntegrationPluginCard chrome, but scoped to PAYMENT_PROVIDERS and wired to
 * the payments actions instead of a per-provider Integrations entry.
 *
 * A plugin-backed provider (Stripe) is added by installing its plugin, then
 * finishes setup on its own settings page.
 *
 * `installedIds` filters out already-installed providers rather than relying
 * on installPaymentPlugin's duplicate-id error as the guard — that error
 * exists as a last-resort invariant, not a UI contract.
 */
export function ProviderCatalog({
  installedIds,
  blockedPluginIds,
}: {
  installedIds: string[];
  blockedPluginIds: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const install = (id: string, label: string, plugin?: string) =>
    start(async () => {
      try {
        if (plugin) {
          const res = await setPluginInstalledAction(plugin, true);
          if (res.error) {
            toast.error(res.error);
            return;
          }
          router.push(`/dashboard/settings/payments/${plugin}`);
          return;
        }
        const res = await installPaymentPlugin(id);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success(`${label} installed`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not install provider");
      }
    });

  const available = PAYMENT_PROVIDERS.filter((p) => !installedIds.includes(p.id));
  if (available.length === 0) {
    return <p className="text-muted-foreground text-sm">All payment providers are installed.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {available.map((provider) => {
        // A provider that is its own plugin installs it on Add, so it is never blocked by it.
        const blocked =
          !!provider.requiresPlugin &&
          provider.requiresPlugin !== provider.id &&
          blockedPluginIds.includes(provider.requiresPlugin);
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
              onClick={() =>
                install(
                  provider.id,
                  provider.label,
                  provider.requiresPlugin === provider.id ? provider.requiresPlugin : undefined,
                )
              }
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
