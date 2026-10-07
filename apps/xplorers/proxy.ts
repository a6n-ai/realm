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

export const PUBLIC_API = [
  "/api/auth",
  // GET serves class photos to anonymous visitors. POST /api/files/upload still
  // requires studioSession:update inside the handler.
  "/api/files",
];

export const PROTECTED_PREFIXES = ["/dashboard", "/me", "/no-access"];

// The organization table is a handful of rows, but every public request (and
// every RSC prefetch) did up to 3 sequential lookups here before routing.
// ponytail: per-process 60s snapshot; a new/renamed org shows up within a minute.
// Move to a shared cache if this app ever runs more than one process.
type OrgSnapshot = { byCode: Map<string, string>; defaultId: string | null; at: number };
let orgSnapshot: OrgSnapshot | null = null;
let orgLoad: Promise<OrgSnapshot> | null = null;
// Tests rewrite org rows between requests, so they always read fresh.
const ORG_TTL_MS = process.env.NODE_ENV === "test" ? 0 : 60_000;

function orgs(): Promise<OrgSnapshot> {
  if (orgSnapshot && Date.now() - orgSnapshot.at < ORG_TTL_MS) return Promise.resolve(orgSnapshot);
  orgLoad ??= db
    .select({ id: organization.id, clientCode: organization.clientCode, isDefault: organization.isDefaultLocation })
    .from(organization)
    .then((rows) => {
      const byCode = new Map<string, string>();
      for (const r of rows) if (r.clientCode) byCode.set(r.clientCode, r.id);
      orgSnapshot = { byCode, defaultId: rows.find((r) => r.isDefault)?.id ?? null, at: Date.now() };
      return orgSnapshot;
    })
    .finally(() => {
      orgLoad = null;
    });
  return orgLoad;
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

  request.headers.delete("x-realm-org-id");

  const resolutionExempt = RESOLUTION_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let resolvedOrgId: string | undefined;

  if (!resolutionExempt) {
    const segment = pathname.split("/")[1] || null;
    const { byCode, defaultId } = await orgs();
    const pickedCode = request.cookies.get("franchise")?.value ?? null;
    resolvedOrgId =
      (segment ? byCode.get(segment) : undefined) ??
      (pickedCode ? byCode.get(pickedCode) : undefined) ??
      defaultId ??
      undefined;
  }

  if (resolvedOrgId) request.headers.set("x-realm-org-id", resolvedOrgId);
  request.headers.set("x-pathname", pathname);
  request.headers.set("x-search", request.nextUrl.search);
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
