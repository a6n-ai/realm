import { z } from "zod";
import type { CloverEnvironment, CloverRegion } from "./urls";

/** App credentials from env — never persist the secret in client-readable JSON. */
export const cloverAppCredentialsSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  region: z.enum(["na", "eu", "la"]).default("na"),
});
export type CloverAppCredentials = z.infer<typeof cloverAppCredentialsSchema>;

/** Expiring OAuth token pair from /oauth/v2/token or /oauth/v2/refresh. */
export const cloverTokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Unix seconds (Clover returns these as integers). */
  accessTokenExpiration: z.number().int().positive(),
  refreshTokenExpiration: z.number().int().positive(),
});
export type CloverTokenPair = z.infer<typeof cloverTokenPairSchema>;

/**
 * Persisted connection state for Settings → Clover (after install).
 * Secrets (appSecret) stay in env; tokens live server-side only.
 */
export const cloverConnectionSchema = z.object({
  installed: z.boolean().default(false),
  connected: z.boolean().default(false),
  merchantId: z.string().min(1).optional(),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  region: z.enum(["na", "eu", "la"]).default("na"),
  /**
   * How this merchant is authenticated. Defaults to "oauth" so every
   * connection persisted before API-token support keeps working.
   */
  authMode: z.enum(["oauth", "apiToken"]).default("oauth"),
  tokens: cloverTokenPairSchema.optional(),
  /**
   * Permanent Platform (v3) merchant API token — items, categories, atomic
   * orders, employees. Clover dashboard → Setup → API Tokens.
   */
  apiToken: z.string().min(1).optional(),
  /**
   * Ecommerce (v1) credentials — pay order, charges, and the PAKMS iframe key.
   * A separate Clover surface with its own tokens: the Platform token above is
   * not accepted there. Only needed for checkout. Dashboard → Ecommerce API Tokens.
   */
  ecommercePublicKey: z.string().min(1).optional(),
  ecommercePrivateToken: z.string().min(1).optional(),
  /** ISO timestamp of last successful OAuth connect/refresh. */
  connectedAt: z.string().min(1).optional(),
});
export type CloverConnection = z.infer<typeof cloverConnectionSchema>;
export type CloverAuthMode = CloverConnection["authMode"];

/** Admin-submitted API-token connection. Token is input-only, never returned. */
export const cloverApiTokenConnectSchema = z.object({
  merchantId: z.string().trim().min(1, "Merchant ID is required"),
  apiToken: z.string().trim().min(1, "API token is required"),
  /** Optional — required only for website checkout (Ecommerce API). */
  ecommercePublicKey: z.string().trim().min(1).optional(),
  ecommercePrivateToken: z.string().trim().min(1).optional(),
  environment: z.enum(["sandbox", "production"]).default("production"),
  region: z.enum(["na", "eu", "la"]).default("na"),
});
export type CloverApiTokenConnectInput = z.infer<typeof cloverApiTokenConnectSchema>;

/**
 * Broader integrations blob (mirrors payment_config style on the app row).
 * Other plugins can add keys later without a new column per plugin.
 *
 * `.loose()` is load-bearing: a stripping object would silently DELETE any other plugin's
 * key every time this parses on the way in or out, so an app-local integration (e.g.
 * tiffin-grab's OptimoRoute block) would vanish the next time Clover settings were saved.
 */
export const integrationsConfigSchema = z
  .object({
    clover: cloverConnectionSchema.optional(),
  })
  .loose();
export type IntegrationsConfig = z.infer<typeof integrationsConfigSchema>;

export const DEFAULT_INTEGRATIONS_CONFIG: IntegrationsConfig = {};
export const DEFAULT_CLOVER_CONNECTION: CloverConnection = {
  installed: false,
  connected: false,
  environment: "sandbox",
  region: "na",
  authMode: "oauth",
};

export function parseIntegrationsConfig(raw: unknown): IntegrationsConfig {
  const parsed = integrationsConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_INTEGRATIONS_CONFIG;
}

export function parseCloverConnection(raw: unknown): CloverConnection {
  const parsed = cloverConnectionSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_CLOVER_CONNECTION };
}

/** Safe projection for admin UI — never includes tokens or app secret. */
export type CloverConnectionPublic = {
  installed: boolean;
  connected: boolean;
  merchantId?: string;
  environment: CloverEnvironment;
  region: CloverRegion;
  authMode: CloverAuthMode;
  connectedAt?: string;
  /**
   * OAuth: access token exists and is not expired (60s skew).
   * API token: always true — merchant API tokens do not expire.
   */
  accessTokenValid: boolean;
};

export function toPublicCloverConnection(conn: CloverConnection): CloverConnectionPublic {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = conn.tokens?.accessTokenExpiration;
  const apiTokenMode = conn.authMode === "apiToken";
  const credentialPresent = apiTokenMode ? Boolean(conn.apiToken) : Boolean(conn.tokens);
  return {
    installed: conn.installed,
    connected: conn.connected && Boolean(conn.merchantId) && credentialPresent,
    merchantId: conn.merchantId,
    environment: conn.environment,
    region: conn.region,
    authMode: conn.authMode,
    connectedAt: conn.connectedAt,
    accessTokenValid: apiTokenMode
      ? Boolean(conn.apiToken)
      : Boolean(exp && exp - 60 > nowSec),
  };
}

/**
 * Read app credentials from process env.
 * Required: CLOVER_APP_ID, CLOVER_APP_SECRET
 * Optional: CLOVER_ENVIRONMENT (sandbox|production), CLOVER_REGION (na|eu|la)
 */
export function loadCloverAppCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CloverAppCredentials | null {
  const appId = env.CLOVER_APP_ID?.trim();
  const appSecret = env.CLOVER_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  const parsed = cloverAppCredentialsSchema.safeParse({
    appId,
    appSecret,
    environment: env.CLOVER_ENVIRONMENT?.trim() || "sandbox",
    region: env.CLOVER_REGION?.trim() || "na",
  });
  return parsed.success ? parsed.data : null;
}
