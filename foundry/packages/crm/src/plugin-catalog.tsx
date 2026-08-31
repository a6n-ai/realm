"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { IntegrationPluginCard, IntegrationPluginCardSkeleton } from "./integration-plugin-card";
import type { PluginMeta } from "./plugin";

/** Plain-JSON mirror of PluginStatus — safe to pass server→client. */
export type PluginCatalogStatus = { installed: boolean; statusLabel?: string };

export type SetPluginInstalled = (
  id: string,
  installed: boolean,
) => Promise<{ error?: string }>;

export function PluginCatalog({
  metas,
  statuses,
  setInstalled,
  slots,
}: {
  metas: readonly PluginMeta[];
  statuses: Record<string, PluginCatalogStatus>;
  setInstalled: SetPluginInstalled;
  /** Plugins that render their own card body instead of the default buttons. */
  slots?: Record<string, ReactNode>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {metas.map((meta) => {
        const custom = slots?.[meta.id];
        if (custom) return <div key={meta.id}>{custom}</div>;
        return (
          <PluginCard
            key={meta.id}
            meta={meta}
            status={statuses[meta.id] ?? { installed: false }}
            setInstalled={setInstalled}
          />
        );
      })}
    </div>
  );
}

function PluginCard({
  meta,
  status,
  setInstalled,
}: {
  meta: PluginMeta;
  status: PluginCatalogStatus;
  setInstalled: SetPluginInstalled;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (installed: boolean, ok: string) =>
    start(async () => {
      const res = await setInstalled(meta.id, installed);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(ok);
      router.refresh();
    });

  return (
    <IntegrationPluginCard
      icon={<meta.icon className="size-5" />}
      label={meta.label}
      description={meta.description}
      statusLabel={status.installed ? (status.statusLabel ?? "Installed") : null}
    >
      {!status.installed ? (
        <Button
          type="button"
          size="sm"
          className="gap-1.5 self-start"
          disabled={pending}
          onClick={() => run(true, `${meta.label} installed`)}
        >
          <PlusIcon className="size-3.5" />
          Add plugin
        </Button>
      ) : (
        <>
          {meta.settingsHref ? (
            <Button asChild type="button" size="sm" variant="outline" className="gap-1.5 self-start">
              <Link href={meta.settingsHref}>
                <SettingsIcon className="size-3.5" />
                Configure
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 self-start text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => run(false, `${meta.label} removed`)}
          >
            <Trash2Icon className="size-3.5" />
            Remove
          </Button>
        </>
      )}
    </IntegrationPluginCard>
  );
}

export function PluginCatalogSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <IntegrationPluginCardSkeleton key={i} />
      ))}
    </div>
  );
}
