import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The proxy runs on the edge runtime, so we do an OPTIMISTIC cookie-presence
// gate here; the authoritative `getSession` role checks live in the
// (Node-runtime) dashboard layout and pages.
// Better Auth session cookie: `${prefix}.session_token` (default prefix
// "better-auth"; `__Secure-` prefixed when cookies are secure / in production).
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

// /api is private by default. Only these prefixes are reachable without a
// session cookie: Better Auth's own handler, and cron (self-auths via
// CRON_SECRET bearer inside the route). Add a prefix here to make it public.
const PUBLIC_API = ["/api/auth", "/api/cron"];

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  const onApi = pathname.startsWith("/api");
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
    const res = NextResponse.next();
    cors.forEach((v, k) => res.headers.set(k, v));
    return res;
  }

  // /me (customer) shares this presence-only gate with /dashboard; the role
  // split (customer vs staff/admin) is decided by the (customer) layout below.
  const onGuarded = pathname.startsWith("/dashboard") || pathname.startsWith("/me");
  if (onGuarded && !hasSession) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
  const res = NextResponse.next();
  // Protected pages must never sit in the browser's bfcache — otherwise after
  // sign-out the Back button restores the rendered dashboard without re-hitting
  // this gate. no-store makes the browser re-request → redirect to /login.
  if (onGuarded) res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/me/:path*", "/api/:path*"],
};
