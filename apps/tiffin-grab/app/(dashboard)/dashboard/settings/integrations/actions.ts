"use server";

import { ValidationError } from "@foundry/commons";
import { blockedBy, resolveStatuses } from "@foundry/crm/server";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { revalidatePublicSite } from "@/lib/landing/revalidate-site";
import { PLUGINS } from "@/lib/plugins.server";

const PLUGIN_PATHS = [
  "/dashboard/settings/integrations",
  "/dashboard/settings/payments",
  "/dashboard/settings/clover",
  "/dashboard/settings",
] as const;

/** Install/uninstall any plugin in the app registry. */
export async function setPluginInstalledAction(id: string, installed: boolean): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: PLUGIN_PATHS }, async () => {
    const plugin = PLUGINS.find((p) => p.id === id);
    if (!plugin) throw new ValidationError("Unknown plugin");

    if (installed) {
      const missing = blockedBy(PLUGINS, id, await resolveStatuses(PLUGINS));
      if (missing.length) throw new ValidationError(`Install ${missing.join(", ")} first`);
    }

    try {
      installed ? await plugin.install() : await plugin.uninstall();
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Could not update plugin");
    }

    await recordAudit({
      entity: "integrations",
      entityPublicId: id,
      operation: installed ? "create" : "delete",
      changes: { _action: installed ? `${id}_install` : `${id}_uninstall` },
      createdBy: await currentUserId(),
    });

    // the Reviews nav entry and page follow the plugin install state
    revalidatePublicSite();
  });
}
