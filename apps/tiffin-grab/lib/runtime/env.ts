import { publicAuthUrl } from "./env.public";

// Every server env read the app shares lives here. Functions, not constants: tests and
// the Workers runtime set process.env after import.

export const DEFAULT_ORIGIN = "https://app.tiffingrab.ca";
export const DEFAULT_DATABASE_URL = "postgres://lawbringr@localhost:5432/tiffin_v2";

const stripSlash = (s: string) => s.trim().replace(/\/+$/, "");

export const isProduction = () => process.env.NODE_ENV === "production";
export const isTest = () => process.env.NODE_ENV === "test";

/** Public origin of the app (no trailing slash), "" when unset: the request host is unreliable behind a proxy. */
export function appOrigin(): string {
  return stripSlash(process.env.BETTER_AUTH_URL ?? publicAuthUrl() ?? "");
}

export const authBaseUrl = () => process.env.BETTER_AUTH_URL;

export const appUrlOr = (fallback: string) => process.env.BETTER_AUTH_URL || fallback;

export const siteOrigin = () => process.env.SITE_URL ?? DEFAULT_ORIGIN;
export const campaignBaseUrl = () => process.env.CAMPAIGN_BASE_URL ?? process.env.SITE_URL;
export const emailBaseUrl = () => stripSlash(process.env.EMAIL_BASE_URL ?? DEFAULT_ORIGIN);
export const filesPublicBaseUrl = () => process.env.FILES_PUBLIC_BASE_URL ?? "/api/files";

export const cronSecret = () => process.env.CRON_SECRET;
/** Cloudflare token (Cache Purge on tiffingrab.ca only). Set: pages stay in the edge cache an hour and are purged on edit. */
export const edgePurgeToken = () => process.env.CF_CACHE_PURGE_TOKEN;
export const awsRegion = () => process.env.AWS_REGION;
export const cookieDomain = () => process.env.AUTH_COOKIE_DOMAIN;
export const databaseUrl = () => process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

// Dev fallbacks keep local .env files without BETTER_AUTH_SECRET working; production must set it.
const DEV_SECRETS = { "receipt-link": "dev-receipt-secret", "magic-link": "dev-magic-link-secret" } as const;

/** BETTER_AUTH_SECRET, the app's one server signing secret, for `purpose`. Each purpose derives its own key from it. */
export function authSecret(purpose: "auth" | "review-nudge" | keyof typeof DEV_SECRETS): string | undefined {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret || isProduction() || !(purpose in DEV_SECRETS)) return secret;
  return DEV_SECRETS[purpose as keyof typeof DEV_SECRETS];
}
