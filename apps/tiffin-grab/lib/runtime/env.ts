import { BRAND_NAME, CONTACT_EMAIL } from "../brand";
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

export const notifyReplyTo = () => process.env.NOTIFY_REPLY_TO ?? CONTACT_EMAIL;
// SES MaxSendRate is 14/s on this account, shared with puchkaman (5/s); stay
// under it so a burst cannot trigger throttling, which damages sender reputation.
export const notifySendRate = () => Number(process.env.NOTIFY_SEND_RATE ?? 8);
export const unsubscribeSecret = () => process.env.UNSUBSCRIBE_SECRET;
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID ?? null;
export const sesFeedbackTopicArn = () => process.env.SES_FEEDBACK_TOPIC_ARN;
export const corsOrigins = () => process.env.CORS_ORIGINS;
export const notifyFrom = () => ({
  email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
  name: process.env.NOTIFY_FROM_NAME ?? BRAND_NAME,
});
export const sesConfigSet = () => process.env.SES_CONFIGURATION_SET;
export const sesTransactionalConfigSet = () => process.env.SES_TRANSACTIONAL_CONFIGURATION_SET;
export const sesTrackedConfigSet = () => process.env.SES_TRACKED_CONFIGURATION_SET;
export const processEnv = () => process.env;

export const integrationsMasterKey = () => process.env.INTEGRATIONS_ENCRYPTION_KEY;
export const gaMeasurementId = () => process.env.GA_MEASUREMENT_ID;
export const e2eBaseUrl = () => process.env.E2E_BASE_URL;
export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY;
export const turnstileSecretKey = () => process.env.TURNSTILE_SECRET_KEY;

export const cronSecret = () => process.env.CRON_SECRET;
/** Cloudflare token (Cache Purge on tiffingrab.ca only). Set: pages stay in the edge cache an hour and are purged on edit. */
export const edgePurgeToken = () => process.env.CF_CACHE_PURGE_TOKEN;
export const awsRegion = () => process.env.AWS_REGION;
export const cookieDomain = () => process.env.AUTH_COOKIE_DOMAIN;
export const databaseUrl = () => process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

// Dev fallbacks keep local .env files without BETTER_AUTH_SECRET working; production must set it.
const DEV_SECRETS = { "receipt-link": "dev-receipt-secret", "magic-link": "dev-magic-link-secret" } as const;

/**
 * What .github/workflows/deploy-worker.yml sets for `next build` only, so importing lib/auth while
 * collecting page data doesn't throw. It is public, so nothing may ever be signed with it.
 */
export const BUILD_PLACEHOLDER_SECRET = "build-time-placeholder-not-used-at-runtime";

/** BETTER_AUTH_SECRET, the app's one server signing secret, for `purpose`. Each purpose derives its own key from it. */
export function authSecret(purpose: "auth" | "review-nudge" | keyof typeof DEV_SECRETS): string | undefined {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret === BUILD_PLACEHOLDER_SECRET) {
    // Better Auth's config reads the secret at import; it only signs per request, which a build never serves.
    // Anything else asking during the build is a prerendered page signing a link: fail the build instead.
    // At runtime it means the Worker secret is missing: fail loudly rather than sign with a public string.
    if (purpose === "auth" && process.env.NEXT_PHASE === "phase-production-build") return secret;
    throw new Error(`BETTER_AUTH_SECRET is the build placeholder; refusing to use it for "${purpose}"`);
  }
  if (secret || isProduction() || !(purpose in DEV_SECRETS)) return secret;
  return DEV_SECRETS[purpose as keyof typeof DEV_SECRETS];
}
