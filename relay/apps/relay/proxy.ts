import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];
const PUBLIC_PREFIXES = ["/api/auth", "/v1", "/login", "/api/webhooks"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPath = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (publicPath) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession && (pathname.startsWith("/dashboard") || pathname.startsWith("/api"))) {
    if (pathname.startsWith("/api")) {
      return new NextResponse(JSON.stringify({ title: "Unauthorized", status: 401 }), {
        status: 401,
        headers: { "content-type": "application/problem+json" },
      });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/v1/:path*", "/login"],
};
