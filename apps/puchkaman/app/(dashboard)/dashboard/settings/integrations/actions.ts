"use server";

import { revalidatePath } from "next/cache";
import {
  buildCloverAuthorizeUrl,
  cloverApiTokenConnectSchema,
  cloverOAuthRedirectUri,
  connectCloverWithApiToken,
  createCloverOAuthState,
  disconnectClover,
  getCloverConnection,
  installCloverPlugin,
  loadCloverAppCredentialsFromEnv,
  verifyCloverApiToken,
  type CloverApiTokenConnectInput,
  type CloverApiTokenConnectResult,
} from "@realm/clover";
import { blockedBy, resolveStatuses } from "@realm/crm/server";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { PLUGINS } from "@/lib/plugins.server";

function revalidatePluginPaths() {
  revalidatePath("/dashboard/settings/integrations");
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

export async function disconnectCloverAction(): Promise<void> {
  await requireAdmin();
  await disconnectClover(integrationsConfigStore);
  await recordAudit({
    entity: "integrations",
    entityPublicId: "clover",
    operation: "update",
    changes: { _action: "clover_disconnect" },
    createdBy: await currentUserId(),
  });
  revalidatePluginPaths();
}

/**
 * Connect a merchant with a permanent API token instead of the developer app.
 * The token is proven against Clover before anything is persisted, and is
 * never echoed back to the client or into the audit trail.
 */
export async function connectCloverApiTokenAction(
  input: CloverApiTokenConnectInput,
): Promise<CloverApiTokenConnectResult> {
  await requireAdmin();
  const parsed = cloverApiTokenConnectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid Clover API token details",
    };
  }

  try {
    await verifyCloverApiToken(parsed.data);
  } catch {
    return {
      ok: false,
      error: "Clover rejected those details. Check the merchant ID, token, and environment.",
    };
  }

  await connectCloverWithApiToken(integrationsConfigStore, parsed.data);
  await recordAudit({
    entity: "integrations",
    entityPublicId: "clover",
    operation: "update",
    changes: {
      _action: "clover_connect_api_token",
      merchantId: parsed.data.merchantId,
      environment: parsed.data.environment,
    },
    createdBy: await currentUserId(),
  });
  revalidatePluginPaths();
  return { ok: true };
}

/** Returns the Clover authorize URL; client navigates (avoids swallowing NEXT_REDIRECT). */
export async function startCloverConnectAction(): Promise<string> {
  await requireAdmin();
  const credentials = loadCloverAppCredentialsFromEnv();
  if (!credentials) {
    throw new Error(
      "Clover app credentials are not configured. Set CLOVER_APP_ID and CLOVER_APP_SECRET.",
    );
  }

  const conn = await getCloverConnection(integrationsConfigStore);
  if (!conn.installed) {
    await installCloverPlugin(integrationsConfigStore);
    await recordAudit({
      entity: "integrations",
      entityPublicId: "clover",
      operation: "create",
      changes: { _action: "clover_install" },
      createdBy: await currentUserId(),
    });
  }

  const state = await createCloverOAuthState();
  return buildCloverAuthorizeUrl({
    appId: credentials.appId,
    redirectUri: cloverOAuthRedirectUri(),
    state,
    environment: credentials.environment,
    region: credentials.region,
  });
}
