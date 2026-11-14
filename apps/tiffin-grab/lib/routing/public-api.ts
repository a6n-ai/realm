// /api is private by default: proxy.ts 401s any /api request without a session cookie unless its path is
// under one of these prefixes. A route listed here must authenticate itself (or be harmless unauthenticated).
// The proxy only checks that a cookie exists, so every other route still calls its own guard
// (lib/routing/__tests__/api-auth.test.ts fails a route that does neither).
//
// /api/auth: Better Auth's own handler.
// /api/cron: self-auths via the CRON_SECRET bearer (lib/cron/auth).
// /api/webhooks: the SES feedback webhook self-auths by verifying the SNS message signature.
// /api/unsubscribe: the HMAC token is the auth, and Gmail/Yahoo POST to it (List-Unsubscribe one-click) with no cookie.
// /api/receipts: the email queue fetches the PDF with no cookie; the route checks the signed link, or the session owner/staff when there is no signature.
// /api/refer-card: the referral promo image; link-preview crawlers fetch it with no cookie.
// /api/analytics: the GA bootstrap script, loaded on every page including signed-out ones.
// /api/public: the read-only public JSON API (lib/public-api); it only republishes what the public pages show.
export const PUBLIC_API = [
  "/api/auth",
  "/api/captcha",
  "/api/cron",
  "/api/webhooks",
  "/api/unsubscribe",
  "/api/receipts",
  "/api/refer-card",
  "/api/analytics",
  "/api/meta/events",
  "/api/health",
  "/api/public",
];

export const isPublicApi = (pathname: string): boolean => PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));
