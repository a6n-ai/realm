"use server";

import { revalidatePath } from "next/cache";
import {
  buildCloverAuthorizeUrl,
  disconnectClover,
  getCloverConnection,
  installCloverPlugin,
  loadCloverAppCredentialsFromEnv,
  uninstallCloverPlugin,
} from "@realm/clover";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { createCloverOAuthState } from "@/lib/clover/oauth-state";
import { cloverOAuthRedirectUri } from "@/lib/clover/redirect-uri";

function revalidateCloverPaths() {
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/settings/clover");
  revalidatePath("/dashboard/settings");
}

export async function installCloverAction(): Promise<void> {
  await requireAdmin();
  await installCloverPlugin(integrationsConfigStore);
  revalidateCloverPaths();
}

export async function uninstallCloverAction(): Promise<void> {
  await requireAdmin();
  await uninstallCloverPlugin(integrationsConfigStore);
  revalidateCloverPaths();
}

export async function disconnectCloverAction(): Promise<void> {
  await requireAdmin();
  await disconnectClover(integrationsConfigStore);
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
