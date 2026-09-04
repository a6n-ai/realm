"use server";

import { revalidatePath } from "next/cache";
import { getDoorDashConfig, setDoorDashConfig } from "@foundry/doordash";
import { requirePermission } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

export async function saveDoorDashUrl(url: string): Promise<{ error?: string }> {
  await requirePermission({ settings: ["write"] });

  if (!url) return { error: "Enter a store URL" };
  try {
    new URL(url);
  } catch {
    return { error: "That doesn't look like a valid URL" };
  }

  const current = await getDoorDashConfig(integrationsConfigStore);
  await setDoorDashConfig(integrationsConfigStore, { ...current, url });

  await recordAudit({
    entity: "integrations",
    entityPublicId: "doorDash",
    operation: "update",
    changes: { _action: "doordash_url", url },
    createdBy: await currentUserId(),
  });

  revalidatePath("/dashboard/settings/doordash");
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/", "layout");

  return {};
}
