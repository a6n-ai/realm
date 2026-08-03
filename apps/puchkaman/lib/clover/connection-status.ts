import {
  getCloverConnection,
  loadCloverStaticCredentialsFromEnv,
  type CloverConnection,
} from "@realm/clover";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

/**
 * Effective Clover connection status for gating inventory/checkout features —
 * true whenever either static credentials (CLOVER_MERCHANT_ID/...) are set in
 * env, or the merchant completed the OAuth "Connect to Clover" flow. Static
 * credentials never touch the persisted `installed`/`connected` flags (those
 * are OAuth-only state), so callers that only checked `getCloverConnection`
 * directly never saw Clover as connected in static mode. Settings pages that
 * need the raw OAuth connection state (e.g. the "Connect to Clover" screen)
 * should keep calling `getCloverConnection` directly instead of this.
 */
export async function getEffectiveCloverConnection(): Promise<CloverConnection> {
  const staticCredentials = loadCloverStaticCredentialsFromEnv();
  if (staticCredentials) {
    return {
      installed: true,
      connected: true,
      merchantId: staticCredentials.merchantId,
      environment: staticCredentials.environment,
      region: staticCredentials.region,
    };
  }
  return getCloverConnection(integrationsConfigStore);
}
