"use server";

import { ValidationError } from "@foundry/commons";
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
} from "@foundry/clover";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { integrationsConfigStore } from "@/lib/payments/integrations-config";

const OPTS = {
  guard: "admin",
  revalidate: ["/dashboard/settings/integrations", "/dashboard/settings/clover", "/dashboard/settings"],
} as const;

export async function disconnectCloverAction(): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    await disconnectClover(integrationsConfigStore);
  });
}

/**
 * Connect a merchant with a permanent API token instead of the developer app.
 * The token is proven against Clover before anything is persisted.
 */
export async function connectCloverApiTokenAction(input: CloverApiTokenConnectInput): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const parsed = cloverApiTokenConnectSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid Clover API token details");
    }

    try {
      await verifyCloverApiToken(parsed.data);
    } catch {
      throw new ValidationError("Clover rejected those details. Check the merchant ID, token, and environment.");
    }

    await connectCloverWithApiToken(integrationsConfigStore, parsed.data);
  });
}

/** Returns the Clover authorize URL; client navigates (avoids swallowing NEXT_REDIRECT). */
export async function startCloverConnectAction(): Promise<ActionResult<{ url: string }>> {
  return staffAction({ guard: "admin" }, async () => {
    const credentials = loadCloverAppCredentialsFromEnv();
    if (!credentials) {
      throw new ValidationError("Clover app credentials are not configured. Set CLOVER_APP_ID and CLOVER_APP_SECRET.");
    }

    const conn = await getCloverConnection(integrationsConfigStore);
    if (!conn.installed) {
      await installCloverPlugin(integrationsConfigStore);
    }

    const state = await createCloverOAuthState();
    return {
      url: buildCloverAuthorizeUrl({
        appId: credentials.appId,
        redirectUri: cloverOAuthRedirectUri(),
        state,
        environment: credentials.environment,
        region: credentials.region,
      }),
    };
  });
}
