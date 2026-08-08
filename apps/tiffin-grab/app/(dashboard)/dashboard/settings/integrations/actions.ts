"use server";

import { revalidatePath } from "next/cache";
import { blockedBy, resolveStatuses } from "@realm/crm/server";
import { requireAdmin } from "@/lib/auth/guards";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { PLUGINS } from "@/lib/plugins.server";

function revalidatePluginPaths() {
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/settings/payments");
  revalidatePath("/dashboard/settings/clover");
  revalidatePath("/dashboard/settings");
}

/**
 * Install/uninstall any plugin in the app registry.
 * Returns errors rather than throwing — a thrown Server Action error reaches
 * the client as an opaque digest with no usable message.
 */
export async function setPluginInstalledAction(
  id: string,
  installed: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const plugin = PLUGINS.find((p) => p.id === id);
  if (!plugin) return { error: "Unknown plugin" };

  const statuses = await resolveStatuses(PLUGINS);

  if (installed) {
    const missing = blockedBy(PLUGINS, id, statuses);
    if (missing.length) {
      return { error: `Install ${missing.join(", ")} first` };
    }
  }

  // The store write can fail (DB down, constraint). Returning the message keeps
  // the constraint true end-to-end — an uncaught throw here would reach the
  // admin as an opaque digest with nothing actionable in it.
  try {
    installed ? await plugin.install() : await plugin.uninstall();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update plugin" };
  }

  await recordAudit({
    entity: "integrations",
    entityPublicId: id,
    operation: installed ? "create" : "delete",
    changes: { _action: installed ? `${id}_install` : `${id}_uninstall` },
    createdBy: await currentUserId(),
  });

  revalidatePluginPaths();
  return {};
}
