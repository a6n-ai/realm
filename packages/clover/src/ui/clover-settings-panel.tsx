"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LinkIcon,
  PuzzleIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { CLOVER_PLUGIN } from "../plugin";
import type { CloverConnectionPublic } from "../config";

/**
 * Settings → Clover panel — connection info, reconnect, disconnect.
 * Shown after the plugin is installed under Integrations
 * (parallel to payment method tabs after a payment plugin is added).
 */
export function CloverSettingsPanel({
  clover,
  merchantName,
  credentialsConfigured,
  integrationsHref,
  onConnect,
  onDisconnect,
}: {
  clover: CloverConnectionPublic;
  merchantName?: string;
  credentialsConfigured: boolean;
  integrationsHref: string;
  /** Returns the Clover authorize URL; client navigates. */
  onConnect: () => Promise<string>;
  onDisconnect: () => Promise<void>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    const status = searchParams.get("clover");
    if (!status) return;
    if (status === "connected") {
      toast.success("Clover connected");
    } else if (status === "error") {
      toast.error(searchParams.get("reason") ?? "Clover connection failed");
    }
    router.replace(window.location.pathname);
  }, [searchParams, router]);

  if (!clover.installed) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-lg">
          <PuzzleIcon className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Clover is not installed</p>
          <p className="text-muted-foreground text-sm">
            Add the Clover plugin under Integrations, then return here to connect a merchant
            account.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={integrationsHref}>Browse plugins</Link>
        </Button>
      </div>
    );
  }

  const startOAuth = () =>
    start(async () => {
      try {
        const url = await onConnect();
        window.location.href = url;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start Clover connect");
      }
    });

  const disconnect = () =>
    start(async () => {
      try {
        await onDisconnect();
        toast.success("Clover disconnected");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not disconnect Clover");
      }
    });

  const statusLabel = !clover.connected
    ? "Installed · not connected"
    : clover.accessTokenValid
      ? "Connected"
      : "Connected · token needs refresh";

  return (
    <SectionCard
      title={CLOVER_PLUGIN.label}
      subtitle="Merchant connection for this app. App ID and secret stay in server env."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ok text-xs font-medium">{statusLabel}</span>
          {clover.connected ? (
            <span className="bg-primary/15 text-primary rounded-md px-2 py-0.5 text-xs font-medium capitalize">
              {clover.environment}
            </span>
          ) : null}
        </div>

        {clover.connected && clover.merchantId ? (
          <dl className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
            {merchantName ? <InfoRow label="Merchant" value={merchantName} /> : null}
            <InfoRow label="Merchant ID" value={clover.merchantId} mono />
            <InfoRow label="Environment" value={capitalize(clover.environment)} />
            <InfoRow label="Region" value={clover.region.toUpperCase()} />
            <InfoRow
              label="Token"
              value={clover.accessTokenValid ? "Valid" : "Needs refresh"}
            />
            {clover.connectedAt ? (
              <InfoRow label="Connected" value={formatConnectedAt(clover.connectedAt)} />
            ) : null}
          </dl>
        ) : null}

        {!credentialsConfigured ? (
          <p className="text-warn text-xs">
            Set CLOVER_APP_ID and CLOVER_APP_SECRET in the server env to connect.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {!clover.connected ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={pending || !credentialsConfigured}
                onClick={startOAuth}
              >
                <LinkIcon className="size-3.5" />
                Connect Clover
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={pending || !credentialsConfigured}
                  onClick={startOAuth}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Reconnect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={pending}
                  onClick={disconnect}
                >
                  <UnplugIcon className="size-3.5" />
                  Disconnect
                </Button>
              </>
            )}
          </div>
          {clover.connected ? (
            <p className="text-muted-foreground text-xs">
              One merchant per app for now. Reconnect replaces the current connection with
              another Clover merchant.
            </p>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

export function CloverSettingsPanelSkeleton() {
  return (
    <div className="bg-card space-y-4 rounded-xl border p-5 shadow-sm">
      <div className="space-y-2">
        <div className="bg-muted h-5 w-24 animate-pulse rounded" />
        <div className="bg-muted h-4 w-72 max-w-full animate-pulse rounded" />
      </div>
      <div className="bg-muted h-3 w-40 animate-pulse rounded" />
      <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="bg-muted h-3 w-16 animate-pulse rounded" />
            <div className="bg-muted h-4 w-28 animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="bg-muted h-8 w-28 animate-pulse rounded-md" />
        <div className="bg-muted h-8 w-24 animate-pulse rounded-md" />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className={`truncate text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function capitalize(value: string): string {
  return value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatConnectedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
