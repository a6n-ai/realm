/**
 * @realm/clover — Clover Platform integration (Phase 1: setup + OAuth).
 *
 * Server-only. App secret and tokens must never reach the client.
 * Later phases: Ecommerce charges, inventory sync, orders, webhooks.
 */

export {
  cloverAppCredentialsSchema,
  cloverTokenPairSchema,
  cloverConnectionSchema,
  integrationsConfigSchema,
  DEFAULT_INTEGRATIONS_CONFIG,
  DEFAULT_CLOVER_CONNECTION,
  parseIntegrationsConfig,
  parseCloverConnection,
  toPublicCloverConnection,
  loadCloverAppCredentialsFromEnv,
  type CloverAppCredentials,
  type CloverTokenPair,
  type CloverConnection,
  type CloverConnectionPublic,
  type IntegrationsConfig,
} from "./config";

export {
  resolveCloverHosts,
  httpsOrigin,
  type CloverEnvironment,
  type CloverRegion,
  type CloverHosts,
} from "./urls";

export {
  buildCloverAuthorizeUrl,
  parseCloverOAuthCallback,
  exchangeCloverAuthorizationCode,
  refreshCloverTokens,
  isCloverAccessTokenExpired,
  type BuildAuthorizeUrlInput,
  type CloverOAuthCallbackParams,
  type ExchangeCodeInput,
  type RefreshTokensInput,
} from "./oauth";

export {
  CloverApiClient,
  CLOVER_WEBHOOK_NOTES,
  type CloverApiClientOptions,
  type CloverMerchantSummary,
} from "./client";

export {
  getCloverConnection,
  setCloverConnection,
  installCloverPlugin,
  uninstallCloverPlugin,
  disconnectClover,
  type IntegrationsConfigStore,
} from "./store";

export { CLOVER_PLUGIN_ID, CLOVER_PLUGIN } from "./plugin";
