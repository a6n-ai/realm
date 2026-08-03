import { CloverApiClient } from "./client";
import {
  getCloverConnection,
  setCloverConnection,
  type IntegrationsConfigStore,
} from "./store";
import {
  loadCloverAppCredentialsFromEnv,
  type CloverApiTokenConnectInput,
} from "./config";
import type { CloverMerchantSummary } from "./client";

/**
 * Prove a merchant API token works before persisting it: a bad token, a wrong
 * merchant id, or the wrong environment all fail here instead of silently
 * landing a dead connection in the integrations config.
 */
export async function verifyCloverApiToken(
  input: CloverApiTokenConnectInput,
): Promise<CloverMerchantSummary> {
  const probe = new CloverApiClient({
    connection: {
      installed: true,
      connected: true,
      authMode: "apiToken",
      merchantId: input.merchantId,
      apiToken: input.apiToken,
      environment: input.environment,
      region: input.region,
    },
  });
  return probe.getMerchant();
}

/**
 * Authenticated Clover API client with token refresh persisted into the
 * app-injected integrations store. Returns null when credentials or a
 * merchant connection are missing.
 */
export async function createCloverClient(
  store: IntegrationsConfigStore,
): Promise<CloverApiClient | null> {
  const connection = await getCloverConnection(store);
  if (!connection.connected || !connection.merchantId) return null;

  // API-token mode needs no developer app: the merchant token is the credential.
  if (connection.authMode === "apiToken") {
    if (!connection.apiToken) return null;
    return new CloverApiClient({ connection });
  }

  const credentials = loadCloverAppCredentialsFromEnv();
  if (!credentials) return null;
  if (!connection.tokens) return null;

  return new CloverApiClient({
    credentials,
    connection,
    onTokensRefreshed: async (tokens) => {
      const latest = await getCloverConnection(store);
      await setCloverConnection(store, {
        ...latest,
        tokens,
        connected: true,
      });
    },
  });
}
