import { appUrlOr, DEFAULT_ORIGIN } from "@/lib/runtime/env";
import publicPages from "./public-pages.json";
// Paths the public apex (tiffingrab.ca) answers itself. Paths in APP_ROOTS 308 to app.; every other path is a 404 on the apex.
// Shared by the proxy (which redirects) and the cross-host splash (which must know a tap
// will leave the host before the redirect happens). Client-safe: no server imports.
const APEX_PUBLIC_EXACT = new Set([
  ...publicPages,
  "/plans", "/terms-and-conditions", "/terms-and-conditions/", "/privacy-policy",
  "/privacy-policy/", "/refund-policy/", "/delivery-policy/", "/legal/", "/favicon.ico", "/opengraph-image.png",
  "/twitter-image.png", "/robots.txt", "/sitemap.xml", "/llms.txt", "/pricing.md", "/.well-known/api-catalog",
  "/.well-known/mcp/server-card.json", "/.well-known/ai-catalog.json", "/.well-known/poppy.json",
  // The landing header asks this on every apex view; a 302 to app. cost a cross-origin hop.
  // The session cookie spans both hosts (AUTH_COOKIE_DOMAIN), so the apex answers it directly.
  "/api/auth/get-session",
]);
const APEX_PUBLIC_PREFIX = ["/menu/", "/locations/", "/refer/", "/r/", "/_next/", "/api/files/", "/api/analytics", "/api/public/", "/.well-known/agent-skills/", "/lottie/", "/uploads/", "/landing/", "/vendor/", "/brand/"];
// First path segments the app host really serves: its own route folders under app/ (the (auth),
// (customer), (dashboard) and (public) groups, minus anything the apex answers) plus /api. Keep it
// current: when you add a top-level folder to those groups, add its segment here, or the apex 404s it.
const APP_ROOTS = new Set([
  "api", "dashboard", "me", "login", "signup", "lock", "verify-email", "forgot-password", "set-password", "magic-link",
  "accept-invitation", "resubscribe", "unsubscribe", "subscribe", "checkout", "activate", "q",
]);
const APEX_SVG = /^\/[^/]*\.svg$/;

/** Origin search engines should index the public pages under: the apex (tiffingrab.ca), derived
 *  from BETTER_AUTH_URL the same way the proxy's front door does. Hosts without "app." (localhost,
 *  previews) keep their own origin. */
export function publicOrigin(): string {
  const app = new URL(appUrlOr(DEFAULT_ORIGIN));
  return app.hostname.startsWith("app.") ? `${app.protocol}//${app.host.slice(4)}` : app.origin;
}

/** A retired delivery-area page, /locations/<slug>: the proxy sends it to its row on /locations. */
export const AREA_PAGE = /^\/locations\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function apexServes(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return APEX_PUBLIC_EXACT.has(p) || APEX_PUBLIC_PREFIX.some((x) => p.startsWith(x)) || APEX_SVG.test(p);
}

/** A path that lives on app.: the apex 308s it there. Case-sensitive, as the app's routes are. */
export function appServes(pathname: string): boolean {
  return APP_ROOTS.has(pathname.split("/")[1] ?? "");
}
