import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "./db/client";
import { organization } from "./db/schema";

const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

const RESOLUTION_EXEMPT = [
  "/api",
  "/dashboard",
  "/me",
  "/no-access",
  "/login",
  "/signup",
  "/forgot-password",
  "/set-password",
];

export const PUBLIC_API = ["/api/auth"];

export const PROTECTED_PREFIXES = ["/dashboard", "/me", "/no-access"];

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
      const pickedCode = request.cookies.get("franchise")?.value ?? null;
      const [picked] = pickedCode
        ? await db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.clientCode, pickedCode))
            .limit(1)
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

  const protectedPrefix = PROTECTED_PREFIXES.find((p) => pathname === p || pathname.startsWith(`${p}/`));
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|json|png|ico|jpg|jpeg|webp|woff|woff2|txt|xml)$).*)",
  ],
};
