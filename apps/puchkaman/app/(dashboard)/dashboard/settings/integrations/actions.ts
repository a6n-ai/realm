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
  uninstallCloverPlugin,
  verifyCloverApiToken,
  type CloverApiTokenConnectInput,
} from "@realm/clover";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

function revalidateCloverPaths() {
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/settings/clover");
  revalidatePath("/dashboard/settings");
}

export async function installCloverAction(): Promise<void> {
  await requireAdmin();
  await installCloverPlugin(integrationsConfigStore);
  await recordAudit({
    entity: "integrations",
    entityPublicId: "clover",
    operation: "create",
    changes: { _action: "clover_install" },
    createdBy: await currentUserId(),
  });
  revalidateCloverPaths();
}

export async function uninstallCloverAction(): Promise<void> {
  await requireAdmin();
  await uninstallCloverPlugin(integrationsConfigStore);
  await recordAudit({
    entity: "integrations",
    entityPublicId: "clover",
    operation: "delete",
    changes: { _action: "clover_uninstall" },
    createdBy: await currentUserId(),
  });
  revalidateCloverPaths();
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
  revalidateCloverPaths();
}

/**
 * Connect a merchant with a permanent API token instead of the developer app.
 * The token is proven against Clover before anything is persisted, and is
 * never echoed back to the client or into the audit trail.
 */
export async function connectCloverApiTokenAction(
  input: CloverApiTokenConnectInput,
): Promise<void> {
  await requireAdmin();
  const parsed = cloverApiTokenConnectSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid Clover API token details");
  }

  try {
    await verifyCloverApiToken(parsed.data);
  } catch {
    throw new Error(
      "Clover rejected those details. Check the merchant ID, token, and environment.",
    );
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
  revalidateCloverPaths();
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
