"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
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
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <span className="text-sm font-bold tracking-tight">Cl</span>
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{CLOVER_PLUGIN.label}</p>
            {statusLabel ? (
              <span className="text-ok inline-flex items-center gap-1 text-xs font-medium">
                <CheckIcon className="size-3.5" />
                {statusLabel}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">{CLOVER_PLUGIN.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
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
      </div>
    </div>
  );
}

export function CloverIntegrationsCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="bg-muted size-9 shrink-0 animate-pulse rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="bg-muted h-4 w-24 animate-pulse rounded" />
          <div className="bg-muted h-3 w-full max-w-56 animate-pulse rounded" />
        </div>
      </div>
      <div className="bg-muted h-8 w-28 animate-pulse rounded-md" />
    </div>
  );
}
