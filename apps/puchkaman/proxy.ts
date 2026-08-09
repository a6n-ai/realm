import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];
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
  // GET is intentionally public (product photos load for anonymous visitors —
  // see app/api/files/[...key]/route.ts); POST /upload still enforces
  // requireAdmin() inside the handler itself, so this doesn't weaken it.
  "/api/files",
];

function unauthorized(): NextResponse {
  const body = { type: "about:blank", title: "Unauthorized", status: 401, detail: "Authentication required" };
  return new NextResponse(JSON.stringify(body), { status: 401, headers: { "content-type": "application/problem+json" } });
}

// Edge-runtime check: cookie presence only (no DB access here). The
// authoritative role check happens in (dashboard)/dashboard/layout.tsx.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (pathname.startsWith("/api")) {
    const isPublic = PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isPublic && !hasSession) return unauthorized();
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
  const res = NextResponse.next();
  if (pathname.startsWith("/dashboard")) res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };
