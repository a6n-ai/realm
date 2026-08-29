import { headers } from "next/headers";

// Reads the organization id proxy.ts resolved from the URL's client-code
// segment, the `franchise` cookie, or the default-location org. Returns null
// on /dashboard, /api, /me, /no-access, and (auth) requests — proxy.ts
// deliberately skips resolution there. Never trust a client-supplied header
// directly: proxy.ts unconditionally strips any incoming x-realm-org-id
// before forwarding, so this value is always proxy-resolved.
export async function resolveRequestOrg(): Promise<string | null> {
  // headers() throws when called with no active Next.js request scope (a
  // plain script, a unit test calling a service function directly, a cron
  // job) — that's "no request" in exactly the same sense as "no org
  // resolved", not an error worth surfacing.
  try {
    const h = await headers();
    return h.get("x-realm-org-id");
  } catch {
    return null;
  }
}
