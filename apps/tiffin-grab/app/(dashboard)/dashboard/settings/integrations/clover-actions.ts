"use server";

import { revalidatePath } from "next/cache";
import {
  buildCloverAuthorizeUrl,
  cloverApiTokenConnectSchema,
  connectCloverWithApiToken,
  disconnectClover,
  getCloverConnection,
  installCloverPlugin,
  loadCloverAppCredentialsFromEnv,
  verifyCloverApiToken,
  type CloverApiTokenConnectInput,
  type CloverApiTokenConnectResult,
} from "@foundry/clover";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { createCloverOAuthState } from "@/lib/clover/oauth-state";
import { cloverOAuthRedirectUri } from "@/lib/clover/redirect-uri";

function revalidateCloverPaths() {
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/settings/clover");
  revalidatePath("/dashboard/settings");
}

export async function disconnectCloverAction(): Promise<void> {
  await requireAdmin();
  await disconnectClover(integrationsConfigStore);
  revalidateCloverPaths();
}

/**
 * Connect a merchant with a permanent API token instead of the developer app.
 * The token is proven against Clover before anything is persisted.
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
  revalidateCloverPaths();
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
