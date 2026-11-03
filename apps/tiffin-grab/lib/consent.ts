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

/** Browser only: has the visitor accepted analytics and ads cookies? */
export function hasAnalyticsConsent(): boolean {
  if (typeof document === "undefined") return false;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1);
  return parseConsent(raw)?.analytics === true;
}
