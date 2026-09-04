"use server";

import { revalidatePath } from "next/cache";
import { getUberEatsConfig, setUberEatsConfig } from "@foundry/uber-eats";
import { requirePermission } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

export async function saveUberEatsUrl(url: string): Promise<{ error?: string }> {
  await requirePermission({ settings: ["write"] });

  if (!url) return { error: "Enter a store URL" };
  try {
    new URL(url);
  } catch {
    return { error: "That doesn't look like a valid URL" };
  }

  const current = await getUberEatsConfig(integrationsConfigStore);
  await setUberEatsConfig(integrationsConfigStore, { ...current, url });

  await recordAudit({
    entity: "integrations",
    entityPublicId: "uberEats",
    operation: "update",
    changes: { _action: "uber_eats_url", url },
    createdBy: await currentUserId(),
  });

  revalidatePath("/dashboard/settings/uber-eats");
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/", "layout");

  return {};
}
