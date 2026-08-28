import { headers } from "next/headers";

// Reads the organization id proxy.ts resolved from the URL's client-code
// segment, the `franchise` cookie, or the default-location org. Returns null
// on /dashboard, /api, /me, /no-access, and (auth) requests — proxy.ts
// deliberately skips resolution there. Never trust a client-supplied header
// directly: proxy.ts unconditionally strips any incoming x-realm-org-id
// before forwarding, so this value is always proxy-resolved.
export async function resolveRequestOrg(): Promise<string | null> {
  const h = await headers();
  return h.get("x-realm-org-id");
}
