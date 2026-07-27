"use client";

import {
  CloverIntegrationsCard,
  CloverIntegrationsCardSkeleton,
} from "@realm/clover/ui";
import type { CloverConnectionPublic } from "@realm/clover";
import { installCloverAction, uninstallCloverAction } from "./actions";

/** Shared Clover card + room for future integration plugins. */
export function PluginsCatalog({ clover }: { clover: CloverConnectionPublic }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CloverIntegrationsCard
        clover={clover}
        settingsHref="/dashboard/settings/clover"
        onInstall={installCloverAction}
        onUninstall={uninstallCloverAction}
      />
    </div>
  );
}

export function PluginsCatalogSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CloverIntegrationsCardSkeleton />
    </div>
  );
}
