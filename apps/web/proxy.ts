import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The proxy runs on the edge runtime, so we do an OPTIMISTIC cookie-presence
// gate here; the authoritative `getSession` role checks live in the
// (Node-runtime) dashboard layout and pages.
// Better Auth session cookie: `${prefix}.session_token` (default prefix
// "better-auth"; `__Secure-` prefixed when cookies are secure / in production).
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export function proxy(request: NextRequest) {
  const onDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (onDashboard && !hasSession) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
