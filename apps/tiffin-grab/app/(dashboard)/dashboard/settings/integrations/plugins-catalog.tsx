"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { CloverConnectionPublic } from "@realm/clover";
import { CloverIntegrationsCard } from "@realm/clover/ui";
import { Button } from "@realm/ui/button";
import { PAYMENT_PLUGIN_CATALOG } from "./registry";
import { installPaymentPlugin, uninstallPaymentPlugin } from "../payments/actions";
import { installCloverAction, uninstallCloverAction } from "./clover-actions";

export function PluginsCatalog({
  installedIds,
  clover,
}: {
  installedIds: string[];
  clover: CloverConnectionPublic;
}) {
  const installed = new Set(installedIds);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PAYMENT_PLUGIN_CATALOG.map((plugin) => {
        const isOn = installed.has(plugin.id);
        return (
          <div
            key={plugin.id}
            className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                <plugin.icon className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{plugin.label}</p>
                  {isOn && (
                    <span className="text-ok inline-flex items-center gap-1 text-xs font-medium">
                      <CheckIcon className="size-3.5" />
                      Installed
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">{plugin.description}</p>
              </div>
            </div>
            <PluginAction pluginId={plugin.id} installed={isOn} label={plugin.label} />
          </div>
        );
      })}
      <CloverIntegrationsCard
        clover={clover}
        settingsHref="/dashboard/settings/clover"
        onInstall={installCloverAction}
        onUninstall={uninstallCloverAction}
      />
    </div>
  );
}

function PluginAction({
  pluginId,
  installed,
  label,
}: {
  pluginId: string;
  installed: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update plugin");
      }
    });

  if (installed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 self-start text-destructive hover:text-destructive"
        disabled={pending}
        onClick={() =>
          run(() => uninstallPaymentPlugin(pluginId), `${label} removed`)
        }
      >
        <Trash2Icon className="size-3.5" />
        Remove
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      className="gap-1.5 self-start"
      disabled={pending}
      onClick={() => run(() => installPaymentPlugin(pluginId), `${label} installed`)}
    >
      <PlusIcon className="size-3.5" />
      Add plugin
    </Button>
  );
}

export function PluginsCatalogSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl border bg-muted/30" />
      ))}
    </div>
  );
}
