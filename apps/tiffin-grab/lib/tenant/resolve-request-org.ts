import { headers } from "next/headers";

// Reads the organization id proxy.ts resolved from the URL's client-code segment
// (docs/superpowers/specs/2026-08-19-tenant-url-routing-design.md). Returns null on
// /dashboard, /api, /me, and (auth)-group requests — proxy.ts deliberately skips
// resolution there (staff sessions carry org context via `member` rows instead, see
// the prior plan's resolveSessionVisibleOrgIds in orders.service.ts) AND
// unconditionally strips any client-supplied x-realm-org-id before forwarding, so a
// caller cannot spoof this value by sending the header directly.
export async function resolveRequestOrg(): Promise<string | null> {
  const h = await headers();
  return h.get("x-realm-org-id");
}
