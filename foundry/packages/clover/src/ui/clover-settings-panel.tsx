"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  KeyRoundIcon,
  LinkIcon,
  PuzzleIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";
import { CLOVER_PLUGIN } from "../plugin";
import type {
  CloverApiTokenConnectInput,
  CloverApiTokenConnectResult,
  CloverConnectionPublic,
} from "../config";
import type { CloverOrderType } from "../orders";

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
  onConnectApiToken,
  orderTypes,
  onSaveWebOrderTypes,
  onCreateOrderType,
}: {
  clover: CloverConnectionPublic;
  merchantName?: string;
  credentialsConfigured: boolean;
  integrationsHref: string;
  /** Returns the Clover authorize URL; client navigates. */
  onConnect: () => Promise<string>;
  onDisconnect: () => Promise<void>;
  /**
   * Connect with a merchant API token instead of the developer app.
   * Omit to hide that path entirely.
   */
  onConnectApiToken?: (
    input: CloverApiTokenConnectInput,
  ) => Promise<CloverApiTokenConnectResult>;
  /** Merchant's live order types, for the website-order mapping below. */
  orderTypes?: CloverOrderType[];
  /** Persist the website-order type mapping. Omit to hide that section. */
  onSaveWebOrderTypes?: (input: { pickup?: string; delivery?: string }) => Promise<void>;
  /** Create a new order type on the merchant. Omit to hide the "create new" option. */
  onCreateOrderType?: (label: string) => Promise<{ id: string; label: string }>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

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

  const connectApiToken = (input: CloverApiTokenConnectInput) =>
    start(async () => {
      setTokenError(null);
      try {
        const result = await onConnectApiToken?.(input);
        // A rejected token comes back as data, not as a throw — throwing from the
        // Server Action hits the error boundary and shows a bare digest instead.
        if (result && !result.ok) {
          setTokenError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success("Clover connected with API token");
        setTokenFormOpen(false);
        router.refresh();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Could not connect with that API token";
        setTokenError(message);
        toast.error(message);
      }
    });

  const saveWebOrderTypes = (input: { pickup?: string; delivery?: string }) =>
    start(async () => {
      try {
        await onSaveWebOrderTypes?.(input);
        toast.success("Website order types saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save order types");
      }
    });

  const apiTokenMode = clover.authMode === "apiToken";
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
            <InfoRow label="Auth" value={apiTokenMode ? "API token" : "OAuth"} />
            <InfoRow
              label="Token"
              value={
                apiTokenMode
                  ? "Permanent"
                  : clover.accessTokenValid
                    ? "Valid"
                    : "Needs refresh"
              }
            />
            {clover.connectedAt ? (
              <InfoRow label="Connected" value={formatConnectedAt(clover.connectedAt)} />
            ) : null}
          </dl>
        ) : null}

        {clover.connected && apiTokenMode ? (
          <p className="text-warn text-xs">
            API-token mode has no webhooks — Clover only delivers those to a registered
            developer app. Keep data current with manual sync and status checks.
          </p>
        ) : null}

        {clover.connected && !clover.ecommerceReady ? (
          <p className="text-warn text-xs">
            <strong>The website is not taking orders.</strong> Catalog and employee sync are
            working, but there are no Ecommerce API credentials, so customers see
            &quot;Coming soon&quot; instead of a cart. Add them from the Clover dashboard
            (Ecommerce API Tokens) by disconnecting and reconnecting with all three values —
            ordering turns on by itself once they are saved.
          </p>
        ) : null}

        {!credentialsConfigured && !apiTokenMode ? (
          <p className="text-warn text-xs">
            Set CLOVER_APP_ID and CLOVER_APP_SECRET in the server env to connect with the
            developer app{onConnectApiToken ? ", or connect with a merchant API token below" : ""}
            .
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

        {clover.connected && onSaveWebOrderTypes ? (
          <WebOrderTypeFields
            orderTypes={orderTypes ?? []}
            initial={clover.webOrderTypes}
            onSave={saveWebOrderTypes}
            onCreate={onCreateOrderType}
            pending={pending}
          />
        ) : null}

        {onConnectApiToken && !clover.connected ? (
          <div className="border-t pt-4">
            {tokenFormOpen ? (
              <ApiTokenForm
                pending={pending}
                error={tokenError}
                defaults={{ environment: clover.environment, region: clover.region }}
                onCancel={() => {
                  setTokenError(null);
                  setTokenFormOpen(false);
                }}
                onSubmit={connectApiToken}
              />
            ) : (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={pending}
                  onClick={() => setTokenFormOpen(true)}
                >
                  <KeyRoundIcon className="size-3.5" />
                  Connect with API token
                </Button>
                <p className="text-muted-foreground text-xs">
                  No developer app needed. Create the token in the Clover dashboard under
                  Setup → API Tokens. Webhooks are not available in this mode.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

/**
 * Maps website fulfillment → Clover order type.
 *
 * This is what makes a website order announce itself on Register. Uber Eats and
 * DoorDash orders arrive already tagged by their own Clover integration, and that
 * tag is what drives the POS alert and the kitchen print rules; an order created
 * through the API with no type just appears silently in the Orders list.
 *
 * Leaving a row unset is valid and keeps the previous untyped behaviour.
 */
function WebOrderTypeFields({
  orderTypes,
  initial,
  onSave,
  onCreate,
  pending,
}: {
  orderTypes: CloverOrderType[];
  initial: { pickup?: string; delivery?: string };
  onSave: (input: { pickup?: string; delivery?: string }) => void;
  onCreate?: (label: string) => Promise<{ id: string; label: string }>;
  pending: boolean;
}) {
  const router = useRouter();
  // Radix Select treats "" as "no value" and refuses an item with an empty value,
  // so an explicit "not set" choice needs a sentinel that never collides with a
  // Clover id.
  const NONE = "__none__";
  const CREATE = "__create__";
  const [pickup, setPickup] = useState(initial.pickup ?? NONE);
  const [delivery, setDelivery] = useState(initial.delivery ?? NONE);
  const [creating, setCreating] = useState<"pickup" | "delivery" | null>(null);
  const [creatingPending, startCreating] = useTransition();

  const dirty = (pickup === NONE ? undefined : pickup) !== initial.pickup
    || (delivery === NONE ? undefined : delivery) !== initial.delivery;

  const rows: {
    key: "pickup" | "delivery";
    label: string;
    defaultName: string;
    value: string;
    set: (v: string) => void;
  }[] = [
    { key: "pickup", label: "Website pickup", defaultName: "Website Pickup", value: pickup, set: setPickup },
    { key: "delivery", label: "Website delivery", defaultName: "Website Delivery", value: delivery, set: setDelivery },
  ];

  const createOrderType = (key: "pickup" | "delivery", label: string) => {
    if (!onCreate) return;
    startCreating(async () => {
      try {
        const created = await onCreate(label);
        toast.success(`Created "${created.label}" on Clover`);
        (key === "pickup" ? setPickup : setDelivery)(created.id);
        setCreating(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create order type");
      }
    });
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Order types for website orders</p>
        <p className="text-muted-foreground text-xs">
          Tag website orders so Register announces and prints them the way it does Uber
          Eats and DoorDash orders. Untagged orders arrive silently in the Orders list.
        </p>
      </div>

      {orderTypes.length === 0 && !onCreate ? (
        <p className="text-warn text-xs">
          No order types found on this merchant. Create them in the Clover dashboard under
          Setup → Order Types, then reload this page.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) =>
              creating === row.key ? (
                <div key={row.key} className="space-y-1.5">
                  <Label htmlFor={`order-type-new-${row.key}`}>{row.label}</Label>
                  <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = new FormData(e.currentTarget).get("name");
                      createOrderType(row.key, String(name ?? "").trim() || row.defaultName);
                    }}
                  >
                    <Input
                      id={`order-type-new-${row.key}`}
                      name="name"
                      defaultValue={row.defaultName}
                      disabled={creatingPending}
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={creatingPending}>
                      Create
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={creatingPending}
                      onClick={() => setCreating(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                </div>
              ) : (
                <div key={row.key} className="space-y-1.5">
                  <Label htmlFor={`order-type-${row.key}`}>{row.label}</Label>
                  <Select
                    value={row.value}
                    onValueChange={(v) => (v === CREATE ? setCreating(row.key) : row.set(v))}
                    disabled={pending || creatingPending}
                  >
                    <SelectTrigger id={`order-type-${row.key}`}>
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not set</SelectItem>
                      {orderTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                      {onCreate ? (
                        <SelectItem value={CREATE}>+ Create new order type…</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              ),
            )}
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !dirty}
            onClick={() =>
              onSave({
                pickup: pickup === NONE ? undefined : pickup,
                delivery: delivery === NONE ? undefined : delivery,
              })
            }
          >
            Save order types
          </Button>
        </>
      )}
    </div>
  );
}

function ApiTokenForm({
  pending,
  error,
  defaults,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  defaults: Pick<CloverConnectionPublic, "environment" | "region">;
  onCancel: () => void;
  onSubmit: (input: CloverApiTokenConnectInput) => void;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const optional = (key: string) => {
          const value = String(data.get(key) ?? "").trim();
          return value ? value : undefined;
        };
        onSubmit({
          merchantId: String(data.get("merchantId") ?? "").trim(),
          apiToken: String(data.get("apiToken") ?? "").trim(),
          ecommercePublicKey: optional("ecommercePublicKey"),
          ecommercePrivateToken: optional("ecommercePrivateToken"),
          environment: (data.get("environment") ??
            defaults.environment) as CloverApiTokenConnectInput["environment"],
          region: (data.get("region") ?? defaults.region) as CloverApiTokenConnectInput["region"],
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="clover-merchant-id">Merchant ID</Label>
          <Input
            id="clover-merchant-id"
            name="merchantId"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. XY1234ABCDEFG"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clover-api-token">API token</Label>
          <Input
            id="clover-api-token"
            name="apiToken"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the token from Setup → API Tokens"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clover-ecom-public">Ecommerce public key</Label>
          <Input
            id="clover-ecom-public"
            name="ecommercePublicKey"
            autoComplete="off"
            spellCheck={false}
            placeholder="Only needed for website checkout"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clover-ecom-private">Ecommerce private token</Label>
          <Input
            id="clover-ecom-private"
            name="ecommercePrivateToken"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Only needed for website checkout"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clover-environment">Environment</Label>
          <Select name="environment" defaultValue={defaults.environment}>
            <SelectTrigger id="clover-environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="sandbox">Sandbox</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clover-region">Region</Label>
          <Select name="region" defaultValue={defaults.region}>
            <SelectTrigger id="clover-region">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="na">North America</SelectItem>
              <SelectItem value="eu">Europe</SelectItem>
              <SelectItem value="la">Latin America</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        The Platform token is verified against Clover before anything is saved, and all
        tokens are stored server-side only. Ecommerce is a separate Clover surface with its
        own tokens (Dashboard → Ecommerce API Tokens) — leave those blank unless this app
        takes payments on the website.
      </p>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="gap-1.5" disabled={pending}>
          <KeyRoundIcon className="size-3.5" />
          Connect
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
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
        {Array.from({ length: 6 }).map((_, i) => (
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
