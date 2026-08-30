/**
 * @realm/clover — Clover Platform + Ecommerce integration.
 *
 * Server-only. App secret and OAuth tokens must never reach the client.
 * PAKMS `apiAccessKey` is safe for the browser iframe SDK.
 */

export {
  cloverAppCredentialsSchema,
  cloverTokenPairSchema,
  cloverConnectionSchema,
  cloverApiTokenConnectSchema,
  integrationsConfigSchema,
  DEFAULT_INTEGRATIONS_CONFIG,
  DEFAULT_CLOVER_CONNECTION,
  parseIntegrationsConfig,
  parseCloverConnection,
  toPublicCloverConnection,
  isCloverEcommerceConfigured,
  resolveWebOrderTypeId,
  loadCloverAppCredentialsFromEnv,
  resolveIntegrationsConfig,
  type CloverAppCredentials,
  type CloverTokenPair,
  type CloverConnection,
  type CloverConnectionPublic,
  type CloverAuthMode,
  type CloverApiTokenConnectInput,
  type CloverApiTokenConnectResult,
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

export { cloverOAuthRedirectUri } from "./redirect-uri";

export {
  createCloverOAuthState,
  consumeCloverOAuthState,
} from "./oauth-state";

export { persistCloverOAuthConnection } from "./complete-oauth";

export { createCloverClient, verifyCloverApiToken } from "./create-client";

export {
  CloverApiClient,
  CLOVER_WEBHOOK_NOTES,
  type CloverApiClientOptions,
  type CloverMerchantSummary,
} from "./client";

export {
  dollarsToCloverCents,
  cloverCentsToDollars,
  normalizeCloverItem,
  normalizeCloverCategory,
  normalizeCloverModifierGroup,
  normalizeCloverModifier,
  normalizeCloverDiscount,
  normalizeCloverTaxRate,
  normalizeCloverTag,
  normalizeCloverMenu,
  normalizeCloverMenuItem,
  cloverRateToPercent,
  percentToCloverRate,
  CLOVER_TAX_RATE_SCALE,
  primaryCategoryName,
  type CloverPriceType,
  type CloverCategoryRef,
  type CloverItemStock,
  type CloverItem,
  type CloverItemCreateInput,
  type CloverItemUpdateInput,
  type CloverCategory,
  type CloverCategoryCreateInput,
  type CloverCategoryUpdateInput,
  type CloverModifierGroupRef,
  type CloverModifierGroup,
  type CloverModifierGroupCreateInput,
  type CloverModifierGroupUpdateInput,
  type CloverModifier,
  type CloverModifierCreateInput,
  type CloverModifierUpdateInput,
  type CloverDiscount,
  type CloverDiscountCreateInput,
  type CloverDiscountUpdateInput,
  type CloverTaxRateRef,
  type CloverTaxRate,
  type CloverTagRef,
  type CloverTag,
  type CloverMenu,
  type CloverMenuItem,
  type CloverElements,
  type ListItemsParams,
  type ListInventoryParams,
} from "./inventory";

export {
  normalizeCloverEmployee,
  type CloverEmployeeRole,
  type CloverEmployee,
  type CloverEmployeeCreateInput,
  type CloverEmployeeUpdateInput,
  type ListEmployeesParams,
} from "./employees";

export {
  normalizeCloverCustomer,
  type CloverCustomer,
  type CloverCustomerEmail,
  type CloverCustomerPhone,
  type CloverCustomerCreateInput,
  type ListCustomersParams,
} from "./customers";

export {
  expandAtomicLineItems,
  buildAtomicOrderBody,
  normalizeAtomicOrderResult,
  normalizeAtomicCheckoutResult,
  normalizePayOrderResult,
  normalizePakmsKey,
  normalizeChargeResult,
  normalizePlatformPayment,
  normalizeEcommerceOrder,
  normalizePlatformOrder,
  mapCloverRemoteToPaymentStatus,
  cloverCheckoutSdkUrl,
  normalizeOrderType,
  normalizeOrderTypes,
  type CloverOrderType,
  type CloverAtomicLineItemInput,
  type CloverAtomicModificationInput,
  type CloverAtomicDiscountInput,
  type CloverAtomicOrderInput,
  type CloverAtomicOrderResult,
  type CloverAtomicCheckoutResult,
  type CloverPayOrderInput,
  type CloverPayOrderResult,
  type CloverPakmsKey,
  type CloverChargeInput,
  type CloverChargeResult,
  type CloverPlatformPaymentResult,
  type CloverEcommerceOrderResult,
  type CloverPlatformOrderResult,
  type MappedCloverPaymentStatus,
} from "./orders";

export {
  safeEqualString,
  verifyCloverWebhookAuth,
  parseCloverWebhookObjectId,
  parseCloverWebhookBody,
  loadCloverWebhookAuthFromEnv,
  type CloverWebhookUpdateType,
  type CloverWebhookUpdate,
  type CloverWebhookEventKind,
  type ParsedCloverObjectId,
  type CloverWebhookParseResult,
} from "./webhooks";

export {
  getCloverConnection,
  setCloverConnection,
  setCloverWebOrderTypes,
  installCloverPlugin,
  uninstallCloverPlugin,
  connectCloverWithApiToken,
  disconnectClover,
  type IntegrationsConfigStore,
} from "./store";

export { CLOVER_PLUGIN_ID, CLOVER_PLUGIN } from "./plugin";
