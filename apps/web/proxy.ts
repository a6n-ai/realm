import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// JWT session strategy: the proxy runs on the edge runtime, so we do an
// OPTIMISTIC cookie-presence gate here and the authoritative `await auth()`
// role checks live in the (Node-runtime) dashboard layout and pages.
// Cookie names per Auth.js v5 (dev + secure).
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

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
