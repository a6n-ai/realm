// Cookie-consent record shared by the banner (client) and the server-side tracking gates.
// Analytics/ads trackers (Google Analytics, Meta Pixel and its Conversions API) run only
// when this record says yes. See components/consent/cookie-consent.tsx.

export const CONSENT_COOKIE = "tg_consent";
/** Bump to ask everyone again (for example when a new kind of tracker is added). */
export const CONSENT_VERSION = 1;

export type Consent = { v: number; analytics: boolean; at: number };

/** Parses the cookie value; null when missing, malformed or from an older version. */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as Consent;
    return c && c.v === CONSENT_VERSION && typeof c.analytics === "boolean" ? c : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  if (typeof document === "undefined") return false;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1);
  return parseConsent(raw)?.analytics === true;
}

// Hosts where the last two labels are a public suffix: a Domain= there is rejected by the
// browser and the whole cookie is dropped, so those keep a host-only cookie.
const SHARED_HOSTS = new Set(["trycloudflare.com", "workers.dev", "pages.dev", "vercel.app", "github.io"]);

/**
 * Domain attribute for the consent cookie: the registrable domain (tiffingrab.ca), so one choice
 * covers tiffingrab.ca and app.tiffingrab.ca (signed-in pages). Null for localhost, IPs and
 * shared hosting suffixes. ponytail: assumes a two-label registrable domain; add a public-suffix
 * list if a client ever sits on something like example.co.uk.
 */
export function consentCookieDomain(hostname: string): string | null {
  if (!hostname.includes(".") || /^[\d.]+$/.test(hostname) || hostname.includes(":")) return null;
  const site = hostname.split(".").slice(-2).join(".");
  return SHARED_HOSTS.has(site) ? null : site;
}
