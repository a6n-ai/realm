"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_PROVIDERS, type PaymentProviderDef } from "@foundry/payments/providers";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { IconTile } from "../_components/icon-tile";
import { CatalogCard, CatalogShelf, CatalogShelfSkeleton } from "../_components/catalog-card";
import { installPaymentPlugin } from "./actions";
import { setPluginInstalledAction } from "../integrations/actions";
import { providerDisplay, providerHref } from "./provider-display";

/**
 * Add payment method: every PAYMENT_PROVIDERS entry as a store card, already-added ones on
 * their own shelf with Open. A plugin-backed provider (Stripe) is added by installing its
 * plugin, then finishes setup on its own page.
 *
 * `installedIds` drives the shelves rather than installPaymentPlugin's duplicate-id error:
 * that error is a last-resort invariant, not a UI contract.
 */
export function ProviderCatalog({
  installedIds,
  blockedPluginIds,
}: {
  installedIds: string[];
  blockedPluginIds: string[];
}) {
  const added = PAYMENT_PROVIDERS.filter((p) => installedIds.includes(p.id));
  const available = PAYMENT_PROVIDERS.filter((p) => !installedIds.includes(p.id));

  return (
    <div className="flex flex-col gap-6">
      {available.length > 0 ? (
        <CatalogShelf title="Available" count={available.length}>
          {available.map((p) => (
            <ProviderCard key={p.id} provider={p} added={false} blockedPluginIds={blockedPluginIds} />
          ))}
        </CatalogShelf>
      ) : (
        <p className="text-muted-foreground text-sm">Every payment method is added. Manage them on the Payment page.</p>
      )}
      {added.length > 0 ? (
        <CatalogShelf title="Added" count={added.length}>
          {added.map((p) => (
            <ProviderCard key={p.id} provider={p} added blockedPluginIds={blockedPluginIds} />
          ))}
        </CatalogShelf>
      ) : null}
    </div>
  );
}

function ProviderCard({
  provider,
  added,
  blockedPluginIds,
}: {
  provider: PaymentProviderDef;
  added: boolean;
  blockedPluginIds: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const d = providerDisplay(provider.id);
  // A provider that is its own plugin installs it on Add, so it is never blocked by it.
  const blockedBy =
    provider.requiresPlugin && provider.requiresPlugin !== provider.id && blockedPluginIds.includes(provider.requiresPlugin)
      ? provider.requiresPlugin
      : null;

  const add = () =>
    start(async () => {
      try {
        if (provider.requiresPlugin === provider.id) {
          const res = await setPluginInstalledAction(provider.id, true);
          if (res.error) {
            toast.error(res.error);
            return;
          }
          router.push(providerHref(provider.id));
          return;
        }
        const res = await installPaymentPlugin(provider.id);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success(`${provider.label} added`, {
          action: { label: "Set up", onClick: () => router.push(providerHref(provider.id)) },
        });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add payment method");
      }
    });

  return (
    <CatalogCard
      tile={<IconTile icon={provider.icon} tone={d.tone} logo={d.logo} size="lg" />}
      title={provider.label}
      category={`${d.kind} · ${d.settles}`}
      description={provider.description}
      status={
        added ? (
          <Badge variant="success-light">Added</Badge>
        ) : blockedBy ? (
          <Badge variant="warning-light">Needs {blockedBy}</Badge>
        ) : null
      }
      action={
        added ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={providerHref(provider.id)} prefetch={false}>
              Open
            </Link>
          </Button>
        ) : (
          <Button size="sm" disabled={pending || !!blockedBy} onClick={add}>
            <PlusIcon data-icon="inline-start" />
            {pending ? "Adding..." : "Add"}
          </Button>
        )
      }
    />
  );
}

export function ProviderCatalogSkeleton() {
  return <CatalogShelfSkeleton cards={PAYMENT_PROVIDERS.length} />;
}
