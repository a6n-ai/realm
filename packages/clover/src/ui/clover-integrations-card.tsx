"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  IntegrationPluginCard,
  IntegrationPluginCardSkeleton,
} from "@realm/crm";
import { Button } from "@realm/ui/button";
import { CLOVER_PLUGIN } from "../plugin";
import type { CloverConnectionPublic } from "../config";

/**
 * Integrations catalog card — install/remove only.
 * Connection details live under Settings → Clover once installed
 * (same split as payment plugins → Settings → Payment).
 */
export function CloverIntegrationsCard({
  clover,
  settingsHref,
  onInstall,
  onUninstall,
}: {
  clover: CloverConnectionPublic;
  /** Settings → Clover route (shown after install). */
  settingsHref: string;
  onInstall: () => Promise<void>;
  onUninstall: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update plugin");
      }
    });

  const statusLabel = !clover.installed
    ? null
    : !clover.connected
      ? "Installed"
      : clover.accessTokenValid
        ? "Connected"
        : "Connected · token needs refresh";

  return (
    <IntegrationPluginCard
      icon={<span className="text-sm font-bold tracking-tight">Cl</span>}
      label={CLOVER_PLUGIN.label}
      description={CLOVER_PLUGIN.description}
      statusLabel={statusLabel}
    >
      {!clover.installed ? (
        <Button
          type="button"
          size="sm"
          className="gap-1.5 self-start"
          disabled={pending}
          onClick={() => run(onInstall, `${CLOVER_PLUGIN.label} installed`)}
        >
          <PlusIcon className="size-3.5" />
          Add plugin
        </Button>
      ) : (
        <>
          <Button asChild type="button" size="sm" variant="outline" className="gap-1.5 self-start">
            <Link href={settingsHref}>
              <SettingsIcon className="size-3.5" />
              {clover.connected ? "Configure" : "Connect"}
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 self-start text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => run(onUninstall, `${CLOVER_PLUGIN.label} removed`)}
          >
            <Trash2Icon className="size-3.5" />
            Remove
          </Button>
        </>
      )}
    </IntegrationPluginCard>
  );
}

export function CloverIntegrationsCardSkeleton() {
  return <IntegrationPluginCardSkeleton />;
}
