import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "./db/client";
import { organization } from "./db/schema";

const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

// Prefixes that never carry a URL-segment clientCode: API, the console, the
// customer account area, and (auth). Resolution is skipped for these paths —
// mirrors tiffin-grab's RESOLUTION_EXEMPT (proxy.ts, same monorepo).
const RESOLUTION_EXEMPT = ["/api", "/dashboard", "/me", "/no-access", "/login", "/forgot-password", "/set-password"];
export const PUBLIC_API = [
  "/api/auth",
  "/api/checkout",
  "/api/catering-inquiries",
  "/api/integrations/clover/webhook",
  "/api/delivery/check-address",
  // Checkout's address typeahead. Public for the same reason check-address is:
  // customers order without an account. Abuse is bounded by the per-IP throttle
  // in the handler, not by auth.
  "/api/delivery/suggest",
  // Basemap proxy — the contact page and checkout map are public, so their
  // tiles, sprites and glyphs must be too. It serves only map assets and holds
  // no credential the browser can extract.
  "/api/map",
  // GET is intentionally public (product photos load for anonymous visitors —
  // see app/api/files/[...key]/route.ts); POST /upload still enforces
  // requireAdmin() inside the handler itself, so this doesn't weaken it.
  "/api/files",
  // Machine-to-machine callbacks. None of these can carry a session cookie, and
  // each authenticates itself in the handler rather than relying on one:
  // /webhooks/ses verifies the SNS signature, /webhooks/twilio/* verifies the
  // Twilio signature. Without this entry SNS's subscription confirmation POST
  // gets a 401 and the subscription never confirms — bounces would silently
  // never reach the database.
  "/api/webhooks",
  // Clicked from an email by someone who may have no account at all. The HMAC
  // token IS the auth (see @realm/notifications/unsubscribe); requiring a
  // session would make the unsubscribe link non-functional, which is the one
  // thing CASL does not forgive.
  "/api/unsubscribe",
  // Operator/worker kick for the outbox. Guarded by the DRAIN_SECRET header.
  // Exact-match only, so it does not open /api/notifications/templates or
  // /api/notifications/campaigns — those stay behind the cookie gate.
  "/api/notifications/drain",
  // Phone verification runs during guest checkout, before any session exists.
  // Both routes are rate limited per number and per IP in the handler.
  "/api/account/phone",
  // Public sign-in/create-account flow: by definition the caller has no session
  // yet. Exact match, so it opens nothing else under /api/account (profile,
  // addresses, ...). The handler is rate limited per IP and per email, creates
  // only a credential-less customer row, and never issues a session — the code
  // itself still comes from /api/auth.
  "/api/account/signup",
  // Server-mirrored cart. A guest with no session must be able to POST their
  // cart snapshot — that's the entire point (email capture pre-signup). The
  // route itself scopes writes via the cart cookie / cartOwner check.
  "/api/cart",
  // Cron endpoints authenticate themselves via CRON_SECRET in the handler, not
  // a session cookie — a scheduler sends a bearer token, never a browser
  // cookie. Prefix match so every route under here (abandoned-recovery,
  // review-nudge, ...) is reachable; each one still 401s without the secret.
  "/api/cron",
];

/**
 * Prefixes that require a session cookie. Cookie presence only — the
 * authoritative role check lives in each route group's layout, which is also
 * what decides that a customer at /dashboard goes to /me rather than /login.
 * /no-access is here so a signed-out visitor gets /login instead of an
 * explainer about an account they are not holding.
 */
export const PROTECTED_PREFIXES = ["/dashboard", "/me", "/no-access"];

function unauthorized(): NextResponse {
  const body = { type: "about:blank", title: "Unauthorized", status: 401, detail: "Authentication required" };
  return new NextResponse(JSON.stringify(body), { status: 401, headers: { "content-type": "application/problem+json" } });
}

// Session check stays cookie-presence-only here; the authoritative role check
// happens in (dashboard)/dashboard/layout.tsx. Tenant resolution below does
// hit the DB (Next 16 defaults proxy to the Node.js runtime, not Edge — see
// tiffin-grab's proxy.ts in this monorepo for the same call), but it's
// additive: it never changes the auth branches, only forwards an org id.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  // Never trust an incoming x-realm-org-id — strip it before any resolution
  // logic runs, so downstream code only ever sees a value this function set.
  request.headers.delete("x-realm-org-id");

  const resolutionExempt = RESOLUTION_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let resolvedOrgId: string | undefined;

  if (!resolutionExempt) {
    const segment = pathname.split("/")[1] || null;
    const [org] = segment
      ? await db.select({ id: organization.id }).from(organization).where(eq(organization.clientCode, segment)).limit(1)
      : [];
    if (org) {
      resolvedOrgId = org.id;
    } else {
      // A visitor-picked franchise (location popup, ip-api-detected or manual)
      // is stored as a plain `franchise` cookie holding clientCode.
      const pickedCode = request.cookies.get("franchise")?.value ?? null;
      const [picked] = pickedCode
        ? await db.select({ id: organization.id }).from(organization).where(eq(organization.clientCode, pickedCode)).limit(1)
        : [];
      if (picked) {
        resolvedOrgId = picked.id;
      } else {
        const [fallback] = await db
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.isDefaultLocation, true))
          .limit(1);
        if (fallback) resolvedOrgId = fallback.id;
      }
    }
  }

  if (resolvedOrgId) request.headers.set("x-realm-org-id", resolvedOrgId);
  const forwardedRequest = { request: { headers: request.headers } };

  if (pathname.startsWith("/api")) {
    const isPublic = PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isPublic && !hasSession) return unauthorized();
    return NextResponse.next(forwardedRequest);
  }

  const protectedPrefix = PROTECTED_PREFIXES.find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (protectedPrefix && !hasSession) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
  const res = NextResponse.next(forwardedRequest);
  if (protectedPrefix) res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export const config = {
  // Broadened from dashboard/me/no-access/api to everything (minus static
  // assets) so the URL-segment/cookie org resolver above also runs on public
  // marketing pages, not just the guarded ones.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|json|png|ico|jpg|jpeg|webp|woff|woff2|txt|xml)$).*)",
  ],
};
