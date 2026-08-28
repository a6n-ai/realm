import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "./db/client";
import { organization } from "./db/schema";

// Proxy defaults to the Node.js runtime as of Next 16 (setting `export const
// runtime` here throws — the option isn't available for proxy files), so a
// real DB query below is fine. We still do an OPTIMISTIC cookie-presence gate
// for the session check; the authoritative `getSession` role checks live in
// the dashboard layout and pages.
// Better Auth session cookie: `${prefix}.session_token` (default prefix
// "better-auth"; `__Secure-` prefixed when cookies are secure / in production).
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

// /api is private by default. Only these prefixes are reachable without a
// session cookie: Better Auth's own handler, cron (self-auths via CRON_SECRET
// bearer inside the route), and the SES feedback webhook (self-auths by
// verifying the SNS message signature). Add a prefix here to make it public.
const PUBLIC_API = ["/api/auth", "/api/cron", "/api/webhooks"];

// Prefixes that never carry a URL-segment clientCode: the console, the API,
// the customer account area, and the (auth) route group's own pages (all
// single-segment, e.g. /login, /signup — none of these are ever a tenant's
// client code). Resolution is skipped for these paths.
const RESOLUTION_EXEMPT = ["/api", "/dashboard", "/me", "/login", "/signup", "/lock", "/verify-email", "/forgot-password", "/set-password"];

// Cross-origin allowlist, comma-separated env. Empty = same-origin only
// (browsers block cross-origin by default — this stays locked until set).
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Headers {
  const h = new Headers();
  if (origin && CORS_ORIGINS.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Credentials", "true");
    h.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    h.set("Access-Control-Allow-Headers", "content-type,authorization");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

function unauthorized(): NextResponse {
  const body = { type: "about:blank", title: "Unauthorized", status: 401, detail: "Authentication required" };
  return new NextResponse(JSON.stringify(body), {
    status: 401,
    headers: { "content-type": "application/problem+json" },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  // Never trust an incoming x-realm-org-id — only this function is allowed to
  // set it. Strip it unconditionally before any resolution logic runs, so
  // every downstream branch forwards either nothing or a value we resolved.
  request.headers.delete("x-realm-org-id");

  const onApi = pathname.startsWith("/api");
  const onDashboard = pathname.startsWith("/dashboard");
  const resolutionExempt = RESOLUTION_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Set on the forwarded request when a URL-segment/default org resolves, so
  // NextResponse.next() below can carry it through via the `request.headers`
  // forwarding mechanism (Task 4 reads it on the Node side).
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
      // is stored as a plain `franchise` cookie holding clientCode, not org id
      // — it's readable/settable from the client, unlike x-realm-org-id.
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
        if (fallback) {
          resolvedOrgId = fallback.id;
        } else if (pathname !== "/locations") {
          return NextResponse.redirect(new URL("/locations", request.url));
        }
      }
    }
  }

  if (resolvedOrgId) request.headers.set("x-realm-org-id", resolvedOrgId);
  const forwardedRequest = { request: { headers: request.headers } };

  if (onApi) {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin);
    // Preflight carries no cookies — answer before the session gate.
    if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });

    const isPublic = PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isPublic && !hasSession) {
      const res = unauthorized();
      cors.forEach((v, k) => res.headers.set(k, v));
      return res;
    }
    const res = NextResponse.next(forwardedRequest);
    cors.forEach((v, k) => res.headers.set(k, v));
    return res;
  }

  // /me (customer) shares this presence-only gate with /dashboard; the role
  // split (customer vs staff/admin) is decided by the (customer) layout below.
  const onGuarded = pathname.startsWith("/dashboard") || pathname.startsWith("/me");
  if (onGuarded && !hasSession) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    // Keep ?month=&sub= so post-login lands back on the same calendar month.
    const returnTo = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("callbackUrl", returnTo);
    return NextResponse.redirect(loginUrl);
  }
  const res = NextResponse.next(forwardedRequest);
  // Protected pages must never sit in the browser's bfcache — otherwise after
  // sign-out the Back button restores the rendered dashboard without re-hitting
  // this gate. no-store makes the browser re-request → redirect to /login.
  if (onGuarded) res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export const config = {
  // Was scoped to /dashboard, /me, /api only. Broadened to everything (minus
  // static assets) so the URL-segment org resolver above also runs on public
  // customer-facing routes, not just the guarded ones.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|json|png|ico|jpg|jpeg|webp|woff|woff2|txt|xml)$).*)",
  ],
};
