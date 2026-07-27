import {
  CloverApiClient,
  getCloverConnection,
  loadCloverAppCredentialsFromEnv,
  setCloverConnection,
} from "@realm/clover";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

/**
 * Authenticated Clover client with token persistence into integrations_config.
 * Returns null when credentials or merchant connection are missing.
 */
export async function createCloverClient(): Promise<CloverApiClient | null> {
  const credentials = loadCloverAppCredentialsFromEnv();
  if (!credentials) return null;
  const connection = await getCloverConnection(integrationsConfigStore);
  if (!connection.connected || !connection.merchantId || !connection.tokens) return null;

  return new CloverApiClient({
    credentials,
    connection,
    onTokensRefreshed: async (tokens) => {
      const latest = await getCloverConnection(integrationsConfigStore);
      await setCloverConnection(integrationsConfigStore, {
        ...latest,
        tokens,
        connected: true,
      });
    },
  });
}
