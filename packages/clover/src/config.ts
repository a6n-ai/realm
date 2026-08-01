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
  tokens: cloverTokenPairSchema.optional(),
  /** ISO timestamp of last successful OAuth connect/refresh. */
  connectedAt: z.string().min(1).optional(),
});
export type CloverConnection = z.infer<typeof cloverConnectionSchema>;

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
  connectedAt?: string;
  /** True when access token exists and is not expired (60s skew). */
  accessTokenValid: boolean;
};

export function toPublicCloverConnection(conn: CloverConnection): CloverConnectionPublic {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = conn.tokens?.accessTokenExpiration;
  return {
    installed: conn.installed,
    connected: conn.connected && Boolean(conn.merchantId && conn.tokens),
    merchantId: conn.merchantId,
    environment: conn.environment,
    region: conn.region,
    connectedAt: conn.connectedAt,
    accessTokenValid: Boolean(exp && exp - 60 > nowSec),
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
