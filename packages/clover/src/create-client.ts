import { CloverApiClient } from "./client";
import {
  getCloverConnection,
  setCloverConnection,
  type IntegrationsConfigStore,
} from "./store";
import { loadCloverAppCredentialsFromEnv } from "./config";

/**
 * Authenticated Clover API client with token refresh persisted into the
 * app-injected integrations store. Returns null when credentials or a
 * merchant connection are missing.
 */
export async function createCloverClient(
  store: IntegrationsConfigStore,
): Promise<CloverApiClient | null> {
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
