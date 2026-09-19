"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PowerIcon, PowerOffIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { IntegrationPluginCard, IntegrationPluginCardSkeleton, type PluginCatalogStatus } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import Link from "next/link";
import { PLUGIN_METAS } from "@/lib/plugins";
import { setPluginInstalledAction } from "./actions";

export function PluginsCatalog({ statuses }: { statuses: Record<string, PluginCatalogStatus> }) {
  const meta = PLUGIN_METAS[0];
  const status = statuses[meta.id] ?? { installed: false };
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (installed: boolean, ok: string) =>
    start(async () => {
      const res = await setPluginInstalledAction(meta.id, installed);
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
      description="Turn on booking payments. Method tabs and the ledger stay visible either way."
      statusLabel={status.installed ? (status.statusLabel ?? "Active") : null}
    >
      {!status.installed ? (
        <Button type="button" size="sm" className="gap-1.5 self-start" disabled={pending} onClick={() => run(true, "Payments activated")}>
          <PowerIcon className="size-3.5" />
          Activate
        </Button>
      ) : (
        <>
          <Button asChild type="button" size="sm" variant="outline" className="gap-1.5 self-start">
            <Link href="/dashboard/settings/payments">
              <SettingsIcon className="size-3.5" />
              Configure
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 self-start text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => run(false, "Payments deactivated")}
          >
            <PowerOffIcon className="size-3.5" />
            Deactivate
          </Button>
        </>
      )}
    </IntegrationPluginCard>
  );
}

export function PluginsCatalogSkeleton() {
  return <IntegrationPluginCardSkeleton />;
}
