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
  setCloverWebOrderTypes,
  loadCloverAppCredentialsFromEnv,
  verifyCloverApiToken,
  type CloverApiTokenConnectInput,
  type CloverApiTokenConnectResult,
} from "@foundry/clover";
import { blockedBy, resolveStatuses } from "@foundry/crm/server";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { PLUGINS } from "@/lib/plugins.server";
import { createCloverClient } from "@/lib/clover/client";

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

/**
 * Choose which Clover order type website orders carry, so Register announces and
 * prints them like an Uber Eats / DoorDash order instead of dropping them
 * silently into the Orders list.
 *
 * Ids are validated against the merchant's live order types rather than trusted
 * from the form: a stale or hand-edited id would be accepted by Clover only at
 * checkout time, turning a settings mistake into a failed customer order.
 */
export async function setCloverWebOrderTypesAction(input: {
  pickup?: string;
  delivery?: string;
}): Promise<void> {
  await requireAdmin();

  const chosen = [input.pickup, input.delivery].filter((v): v is string => Boolean(v));
  if (chosen.length) {
    const client = await createCloverClient();
    if (!client) throw new Error("Clover is not connected");
    const live = new Set((await client.listOrderTypes()).map((t) => t.id));
    const unknown = chosen.find((id) => !live.has(id));
    if (unknown) throw new Error("That order type no longer exists on this merchant");
  }

  await setCloverWebOrderTypes(integrationsConfigStore, input);
  await recordAudit({
    entity: "integrations",
    entityPublicId: "clover",
    operation: "update",
    changes: { _action: "clover_web_order_types", ...input },
    createdBy: await currentUserId(),
  });
  revalidatePluginPaths();
}

/** Create a new Clover order type (e.g. "Website Pickup") without leaving the app. */
export async function createCloverOrderTypeAction(
  label: string,
): Promise<{ id: string; label: string }> {
  await requireAdmin();
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Order type name is required");

  const client = await createCloverClient();
  if (!client) throw new Error("Clover is not connected");
  const created = await client.createOrderType(trimmed);
  await recordAudit({
    entity: "integrations",
    entityPublicId: "clover",
    operation: "create",
    changes: { _action: "clover_order_type_created", ...created },
    createdBy: await currentUserId(),
  });
  revalidatePluginPaths();
  return created;
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
