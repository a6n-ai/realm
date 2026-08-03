import type { CloverAppCredentials, CloverTokenPair } from "./config";
import {
  getCloverConnection,
  setCloverConnection,
  type IntegrationsConfigStore,
} from "./store";

/**
 * Persist a successful OAuth token exchange onto the integrations store.
 * Call after `exchangeCloverAuthorizationCode` + CSRF state validation.
 */
export async function persistCloverOAuthConnection(
  store: IntegrationsConfigStore,
  input: {
    credentials: CloverAppCredentials;
    merchantId: string;
    tokens: CloverTokenPair;
  },
): Promise<void> {
  const current = await getCloverConnection(store);
  await setCloverConnection(store, {
    ...current,
    installed: true,
    connected: true,
    // Reconnecting via OAuth must drop any API token left by the other mode.
    authMode: "oauth",
    apiToken: undefined,
    merchantId: input.merchantId,
    environment: input.credentials.environment,
    region: input.credentials.region,
    tokens: input.tokens,
    connectedAt: new Date().toISOString(),
  });
}
