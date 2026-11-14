import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "./db/client";
import { organization } from "./db/schema";
import { SESSION_COOKIES } from "./lib/auth/cookie-prefix";
import { syncSessionHint } from "./lib/auth/session-hint";
import probePath from "./lib/routing/probe-path.json";
import publicPages from "./lib/routing/public-pages.json";
import { isPublicApi } from "./lib/routing/public-api";
import { AREA_PAGE, apexServes, appServes, skipsOrgResolution } from "./lib/routing/apex";
import { MD_PAGES, wantsMarkdown } from "@/lib/landing/markdown-negotiation";
import { isReferralCodeShape, normalizeReferralCode, setReferralCookie } from "./lib/referrals/cookie";
import { appUrlOr, isTest } from "@/lib/runtime/env";

// Proxy defaults to the Node.js runtime as of Next 16 (setting `export const
// runtime` here throws — the option isn't available for proxy files), so a
// real DB query below is fine. We still do an OPTIMISTIC cookie-presence gate
// for the session check; the authoritative `getSession` role checks live in
// the dashboard layout and pages.
// Better Auth session cookie names: see lib/auth/cookie-prefix.ts.

// Vuln scanners (.env, .git, next.config, IDE mcp files, …). 404 before org resolution / Next.
// The pattern lives in lib/routing/probe-path.json, which cloudflare/worker.js also imports.
const PROBE_PATH = new RegExp(probePath.source, probePath.flags);

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

// The organization table is a handful of rows, but every public request (and
// every RSC prefetch) did up to 3 sequential lookups here before routing.
// ponytail: 60s snapshot per process/isolate; a new/renamed org shows up within a
// minute. Only the plain-data snapshot is shared: an in-flight query promise must
// not be, because Workers reject I/O started by another request.
type OrgSnapshot = { byCode: Map<string, string>; defaultId: string | null; at: number };
let orgSnapshot: OrgSnapshot | null = null;
// Tests rewrite org rows between requests, so they always read fresh.
const ORG_TTL_MS = isTest() ? 0 : 60_000;

async function orgs(): Promise<OrgSnapshot> {
  if (orgSnapshot && Date.now() - orgSnapshot.at < ORG_TTL_MS) return orgSnapshot;
  const rows = await db
    .select({ id: organization.id, clientCode: organization.clientCode, isDefault: organization.isDefaultLocation })
    .from(organization);
  const byCode = new Map<string, string>();
  for (const r of rows) if (r.clientCode) byCode.set(r.clientCode, r.id);
  orgSnapshot = { byCode, defaultId: rows.find((r) => r.isDefault)?.id ?? null, at: Date.now() };
  return orgSnapshot;
}

// Front door: the apex and www rules, in the app itself, with Cloudflare in front. The app host comes from BETTER_AUTH_URL;
// the apex is that host without "app.". Any other config (localhost, previews) leaves this inert.
// Paths match case-insensitively, a trailing "*" as a prefix, and "/*.svg" within one segment.
// Public pages served from the cacheable /site/<org> tree. Exact matches only.
// The cacheable pages (public-pages.json) plus two legacy paths next.config.ts redirects.
const SITE_PAGES = new Set([...publicPages, "/menu/weekly", "/plans"]);

// A referral friend page, /refer/<code>: personalised, so never in public-pages.json (edge cache).
// Any one segment goes through: the page falls back to the general refer content for a mistyped
// or unknown code, which beats a 404 for someone who typed a friend's code by hand.
function siteFriendPath(pathname: string): string | null {
  const m = /^\/refer\/([^/]+)$/.exec(pathname);
  const code = m ? normalizeReferralCode(m[1]!).replace(/[^A-Z0-9]/g, "") : "";
  return code ? `/refer/${code}` : null;
}

const STATIC_PATH = /^\/(?:_next\/(?:static|image)\/|favicon\.ico$|sitemap\.xml$|robots\.txt$)|\.(?:svg|json|png|ico|jpg|jpeg|webp|woff|woff2|txt|xml)$/;

function frontDoor(request: NextRequest): NextResponse | null {
  const appHost = new URL(appUrlOr("http://localhost")).hostname;
  if (!appHost.startsWith("app.")) return null;
  const apex = appHost.slice(4);
  const { hostname, pathname, search } = request.nextUrl;
  if (hostname === `www.${apex}`) return NextResponse.redirect(`https://${apex}${pathname}${search}`, 308);
  if (hostname !== apex) return null;
  if (apexServes(pathname)) return null;
  if (appServes(pathname)) return NextResponse.redirect(`https://${appHost}${pathname}${search}`, 308);
  // An address no route matches: Next renders app/not-found.tsx with a 404, the same on Node and Workers
  // (the internal /_not-found route is not a documented rewrite target). Never add a route by this name.
  return NextResponse.rewrite(new URL("/__apex-not-found", request.url), { status: 404 });
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
  // Cheap rejects before front-door redirects / org snapshot / Next — scanners were a large
  // share of Worker invocations (and would otherwise 302 to app. from the apex).
  if (PROBE_PATH.test(pathname)) return new NextResponse(null, { status: 404 });
  // The old edge never set the referral cookie on these redirects; the app does now.
  const door = frontDoor(request);
  if (door) return door;
  // /site/<org>/... is reachable only through the rewrite below (which never re-enters the proxy).
  if (/^\/site(?:\/|$)/i.test(pathname)) return new NextResponse(null, { status: 404 });
  // An agent asking for markdown (Accept: text/markdown) gets the page as markdown built from live data.
  if (request.method === "GET" && MD_PAGES.has(pathname) && wantsMarkdown(request.headers.get("accept"))) {
    const headers = new Headers(request.headers);
    headers.set("x-md-path", pathname);
    return NextResponse.rewrite(new URL("/agents-md", request.url), { request: { headers } });
  }
  // The apex matcher entry below sends static assets here too; they skip everything else, as before.
  // With Assets run_worker_first exclusions these ideally never reach the isolate; belt-and-braces here.
  if (STATIC_PATH.test(pathname)) return NextResponse.next();
  const res = await route(request);
  syncSessionHint(request, res);
  // A share link: remember the code until the friend signs in (attached there).
  // ...or the friend page itself (/refer/<code>): its header and footer links carry no ?ref=.
  const ref = normalizeReferralCode(request.nextUrl.searchParams.get("ref") ?? /^\/refer\/([^/]+)$/.exec(pathname)?.[1] ?? "");
  if (isReferralCodeShape(ref)) setReferralCookie(res.cookies, ref);
  return res;
}

async function route(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  // Never trust an incoming x-realm-org-id — only this function is allowed to
  // set it. Strip it unconditionally before any resolution logic runs, so
  // every downstream branch forwards either nothing or a value we resolved.
  request.headers.delete("x-realm-org-id");

  const onApi = pathname.startsWith("/api");
  const resolutionExempt = skipsOrgResolution(pathname);

  // Set on the forwarded request when a URL-segment/default org resolves, so
  // NextResponse.next() below can carry it through via the `request.headers`
  // forwarding mechanism (Task 4 reads it on the Node side).
  let resolvedOrgId: string | undefined;

  if (!resolutionExempt) {
    const segment = pathname.split("/")[1] || null;
    const { byCode, defaultId } = await orgs();
    // A visitor-picked franchise (location popup, ip-api-detected or manual)
    // is stored as a plain `franchise` cookie holding clientCode, not org id
    // — it's readable/settable from the client, unlike x-realm-org-id.
    const pickedCode = request.cookies.get("franchise")?.value ?? null;
    resolvedOrgId =
      (segment ? byCode.get(segment) : undefined) ??
      (pickedCode ? byCode.get(pickedCode) : undefined) ??
      defaultId ??
      undefined;
    if (!resolvedOrgId && pathname !== "/locations") {
      return NextResponse.redirect(new URL("/locations", request.url));
    }
  }

  if (resolvedOrgId) request.headers.set("x-realm-org-id", resolvedOrgId);
  const forwardedRequest = { request: { headers: request.headers } };

  // Every method: server actions POST to the page URL, which now exists only under /site/<org>.
  // Area pages were folded into /locations: keep their indexed URLs alive as anchors on it.
  if (AREA_PAGE.test(pathname)) return NextResponse.redirect(new URL(`/locations#${pathname.slice("/locations/".length)}`, request.url), 308);
  const friendPath = siteFriendPath(pathname);
  if (SITE_PAGES.has(pathname) || friendPath) {
    const target = `/site/${resolvedOrgId ?? "brand"}${pathname === "/" ? "" : friendPath ?? pathname}`;
    return NextResponse.rewrite(new URL(target, request.url), forwardedRequest);
  }

  // The public API answers its own CORS (any origin, no credentials) and its own preflight.
  if (onApi && pathname.startsWith("/api/public/")) return NextResponse.next(forwardedRequest);

  if (onApi) {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin);
    // Preflight carries no cookies — answer before the session gate.
    if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });

    // Which prefixes skip this gate, and why, lives in lib/routing/public-api.ts.
    if (!isPublicApi(pathname) && !hasSession) {
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
  // Segment-boundary match, not a bare prefix: "/me".startsWith would also
  // catch "/menu" (public) and wrongly force it through the login gate.
  // /activate/<order>: the order id is in emails and legacy wc- ids are sequential,
  // and the page shows the delivery location; the page itself checks owner/staff.
  const onGuarded = ["/dashboard", "/me", "/activate"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
  // The first entry skips static-looking paths. On the public hosts the second entry runs the proxy for
  // those too, so frontDoor can 302 non-allowlisted ones (/wp-content/x.jpg, /manifest.json).
  // A matcher must be a static literal, so the hosts are spelled out; keep in step with BETTER_AUTH_URL.
  // Was scoped to /dashboard, /me, /api only. Broadened to everything (minus
  // static assets) so the URL-segment org resolver above also runs on public
  // customer-facing routes, not just the guarded ones.
  matcher: [
    "/site/:path*",
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|json|png|ico|jpg|jpeg|webp|woff|woff2|txt|xml)$).*)",
    { source: "/:path*", has: [{ type: "header", key: "host", value: "(www\\.)?tiffingrab\\.ca" }] },
  ],
};
