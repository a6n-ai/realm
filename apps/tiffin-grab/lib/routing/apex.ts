// Paths the public apex (tiffingrab.ca) answers itself; every other path 302s to app.
// Shared by the proxy (which redirects) and the cross-host splash (which must know a tap
// will leave the host before the redirect happens). Client-safe: no server imports.
const APEX_PUBLIC_EXACT = new Set([
  "/", "/pricing", "/plans", "/menu", "/locations", "/faq", "/contact", "/reviews", "/legal", "/terms", "/privacy",
  "/refund-policy", "/delivery-policy", "/refer", "/terms-and-conditions", "/terms-and-conditions/", "/privacy-policy",
  "/privacy-policy/", "/refund-policy/", "/delivery-policy/", "/legal/", "/favicon.ico", "/opengraph-image.png",
  "/twitter-image.png", "/robots.txt", "/sitemap.xml", "/llms.txt",
  // The landing header asks this on every apex view; a 302 to app. cost a cross-origin hop.
  // The session cookie spans both hosts (AUTH_COOKIE_DOMAIN), so the apex answers it directly.
  "/api/auth/get-session",
]);
const APEX_PUBLIC_PREFIX = ["/menu/", "/locations/", "/refer/", "/r/", "/_next/", "/api/files/", "/api/analytics", "/lottie/", "/uploads/", "/landing/", "/vendor/", "/brand/"];
const APEX_SVG = /^\/[^/]*\.svg$/;

/** Origin search engines should index the public pages under: the apex (tiffingrab.ca), derived
 *  from BETTER_AUTH_URL the same way the proxy's front door does. Hosts without "app." (localhost,
 *  previews) keep their own origin. */
export function publicOrigin(): string {
  const app = new URL(process.env.BETTER_AUTH_URL || "https://app.tiffingrab.ca");
  return app.hostname.startsWith("app.") ? `${app.protocol}//${app.host.slice(4)}` : app.origin;
}

/** A retired delivery-area page, /locations/<slug>: the proxy sends it to its row on /locations. */
export const AREA_PAGE = /^\/locations\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function apexServes(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return APEX_PUBLIC_EXACT.has(p) || APEX_PUBLIC_PREFIX.some((x) => p.startsWith(x)) || APEX_SVG.test(p);
}
