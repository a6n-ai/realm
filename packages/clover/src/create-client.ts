import { CloverApiClient } from "./client";
import {
  getCloverConnection,
  setCloverConnection,
  type IntegrationsConfigStore,
} from "./store";
import { loadCloverAppCredentialsFromEnv, loadCloverStaticCredentialsFromEnv } from "./config";

/**
 * Authenticated Clover API client. Tries static merchant credentials first
 * (CLOVER_MERCHANT_ID / CLOVER_MERCHANT_API_TOKEN / CLOVER_ECOMMERCE_*  env
 * vars — a single-merchant integration generated directly from its own
 * Dashboard, no Developer app or OAuth install needed). Falls back to the
 * OAuth app-install flow (CLOVER_APP_ID/SECRET + a stored merchant
 * connection, with token refresh persisted into the app-injected
 * integrations store) when static credentials aren't configured.
 * Returns null when neither is available.
 */
export async function createCloverClient(
  store: IntegrationsConfigStore,
): Promise<CloverApiClient | null> {
  const staticCredentials = loadCloverStaticCredentialsFromEnv();
  if (staticCredentials) {
    return new CloverApiClient({ static: staticCredentials });
  }

  const credentials = loadCloverAppCredentialsFromEnv();
  if (!credentials) return null;
  const connection = await getCloverConnection(store);
  if (!connection.connected || !connection.merchantId || !connection.tokens) {
    return null;
  }

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
