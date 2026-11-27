import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static scan: every entry point must reach a guard. No DB, no request.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Guard calls only. A bare word (getSession, CRON_SECRET, a type name) is not a guard.
const ACTION_GUARD =
  /\b(staffAction|orderAction|requirePermission|requirePermissionIn|assertStaffSession|requireCustomer|requireCustomerId|requireCustomerSession|requireCustomerIdOrRedirect|requireActiveUser|guardPublicWrite|publicWriteRefusal|assertCanManage\w*|assertOwn\w*|callerIsStaff|isStaffRole)\(/;
const ROUTE_GUARD =
  /\b(requirePermission|requirePermissionIn|assertStaffSession|adminRoute|adminIdRoute|withCronAuth|cronRoutes|cronJobRoute|verify\w*(Secret|Signature|Webhook|Captcha|Challenge|SnsMessage)\w*|constructEvent|parseStripeEvent|captchaPasses|requireCustomer\w*|requireActiveUser|requireAccountUser)\(/;
// A page guard is its own call. `<Can>` only hides UI; the RSC payload still ships what the page loads.
const PAGE_GUARD = /\b(requirePagePermission|requirePermission|requirePermissionIn|assertStaffSession|requireAccountUser)\(/;

// Entry points that are public or self-authenticating by design. Each needs a reason.
const PUBLIC_ROUTES: Record<string, string> = {
  "app/api/health/route.ts": "liveness probe, returns no data",
  "app/api/auth/[...all]/route.ts": "Better Auth handler, authenticates its own requests",
  "app/api/map/style/route.ts": "public map style for the storefront map",
  "app/api/map/tiles/[z]/[x]/[y]/route.ts": "public map tiles",
  "app/api/map/glyphs/[fontstack]/[range]/route.ts": "public map font glyphs",
  "app/api/map/sprites/[file]/route.ts": "public map sprite sheets",
  "app/api/analytics/route.ts": "returns public GA and Meta Pixel ids only",
  "app/api/meta/events/route.ts": "browser pixel relay, accepts events and returns nothing sensitive",
  "app/api/refer-card/[code]/route.tsx": "public referral card image, the code is the secret",
  "app/api/public/v1/contact/route.ts": "static GET of public contact details",
  "app/api/public/v1/docs/route.ts": "public API documentation",
  "app/api/public/v1/openapi.json/route.ts": "public OpenAPI document",
  "app/api/public/v1/health/route.ts": "liveness probe for the public API",
  "app/api/public/v1/menu/route.ts": "public storefront catalog, read-only",
  "app/api/public/v1/plans/route.ts": "public storefront plans, read-only",
  "app/api/public/v1/faq/route.ts": "public storefront FAQ, read-only",
  "app/api/public/v1/promotions/route.ts": "public storefront promotions, read-only",
  "app/api/public/v1/delivery/check/route.ts": "public serviceability check for a postcode",
  "app/api/public/v1/delivery/route.ts": "public delivery zones, read-only",
  "app/api/unsubscribe/route.ts": "email unsubscribe link, authorized by the signed token in the URL",
  "app/api/review-nudge/unsubscribe/route.ts": "email unsubscribe link, authorized by the signed token in the URL",
  "app/api/realtime/route.ts": "realtime handshake, channel authorization is checked by authorizeChannel",
  "app/api/public/mcp/route.ts": "public MCP endpoint, no auth by design and only public data (see the route comment)",
  "app/api/public/v1/referral/route.ts": "public referral program copy, read-only",
  "app/api/files/[...key]/route.ts": "secured files need an ak token that filesSecuredAccess.validate checks; other files are served as-is",
};

// Session-scoped routes: the proxy 401s signed-out callers (not in PUBLIC_API), and the handler scopes data to the caller.
const SESSION_SCOPED_ROUTES: Record<string, string> = {
  "app/api/notifications/route.ts": "returns 401 without a session, feed and read state are the caller's own",
  "app/api/address/resolve/route.ts": "session-only via the proxy, always 200 by design (throttled results are not errors)",
  "app/api/address/suggest/route.ts": "session-only via the proxy, always 200 by design (throttled results are not errors)",
};

// Customer self-service exports: the caller's own session scopes every read and write, but no guard call
// appears in the export's body. Keyed file:export, so a new export in the same file is scanned again.
const CUSTOMER_SELF_SERVICE_ACTIONS: Record<string, string> = {
  "app/(auth)/login/actions.ts:verifyPinAction": "getSession, PIN check for the caller's own session",
  "app/(auth)/set-password/actions.ts:setInitialPassword": "getSession, sets the caller's own password",
  "app/(customer)/me/review-nudge-actions.ts:markReviewNudgeDone": "getSession, marks the caller's own review nudge",
  "lib/account/actions.ts:deleteMyAccount": "requireAccountUser, password-checked delete of the caller's own account",
  "lib/checkout/actions.ts:confirmSubscription": "resolveContact requires a session before placeSubscription's out-of-zone waitlist branch; the session needs captcha and cap first",
  "lib/checkout/actions.ts:payCheckout": "getSession, the caller's own checkout",
  "lib/payments/card-actions.ts:removeSavedCard": "getSession, removes only the caller's saved cards",
  "lib/payments/customer-actions.ts:claimPaymentAction": "loadClaimPaymentContext calls assertCanManageOrder (one helper hop)",
  "lib/payments/pay-actions.ts:confirmReturn": "getSession and ownsPayment",
  "lib/payments/pay-actions.ts:newCustomerSession": "getSession, returns the caller's own session secret",
  "lib/referrals/customer-actions.ts:enterReferralCode": "currentUserId, the caller's own referral code",
  "lib/services/filter-usage.actions.ts:recordFilterUseAction": "per-user filter preferences, the service reads getSession",
  "lib/services/filter-usage.actions.ts:filterRecommendationsAction": "per-user filter preferences, the service reads getSession",
  "lib/services/section-seen.actions.ts:markReadAction": "per-user seen markers, the service reads getSession",
  "lib/services/section-seen.actions.ts:markAllReadAction": "per-user seen markers, the service reads getSession",
  "lib/support/customer-actions.ts:createTicket": "currentUserId scopes tickets to the caller",
  "lib/support/customer-actions.ts:replyTicket": "currentUserId scopes tickets to the caller",
  "lib/support/customer-actions.ts:rateTicket": "currentUserId scopes tickets to the caller",
};

// Actions that are public or self-authenticating by design, keyed file:export.
const PUBLIC_ACTIONS: Record<string, string> = {
  "app/(auth)/accept-invitation/actions.ts:acceptInvitationAction": "invitation token is the credential",
  "app/(public)/resubscribe/actions.ts:confirmResubscribe": "resubscribe token checked by verifyResubscribeToken",
  "lib/auth/lock-actions.ts:lockSession": "sets the caller's own lock cookie, no data read",
  "lib/auth/lock-actions.ts:clearLockSession": "clears the caller's own lock cookie",
  "lib/auth/organization-actions.ts:switchActiveOrganization": "Better Auth validates the session and membership",
  "lib/menu/pick-grid-actions.ts:loadPickGrid": "guarded by assertCanManageOrder (staff or order owner)",
  "lib/tenant/detect-location.ts:detectFranchiseByIp": "public location detection, read-only",
  "lib/tenant/detect-location.ts:listLocationsAction": "public location list, read-only",
  "lib/wizard/actions.ts:listCheckoutPaymentMethods": "public checkout quote, read-only",
  "lib/wizard/actions.ts:reprice": "public checkout quote, read-only, server-side pricing",
  "lib/wizard/actions.ts:validatePostal": "public serviceability check, read-only",
  "lib/wizard/actions.ts:rememberReferralCode": "public referral capture, sets a cookie only",
  "lib/meta/actions.ts:sendMetaClientEvent": "browser pixel relay, returns nothing sensitive",
};

// Dashboard pages that only redirect and render no data (or re-export a page that guards itself).
const REDIRECT_ONLY_PAGES: Record<string, string> = {
  "app/(dashboard)/dashboard/payments/page.tsx": "redirects to a sub-page",
  "app/(dashboard)/dashboard/customers/[id]/payments/page.tsx": "redirects to the merged Orders & payments tab (which gates payments on finance:read)",
  "app/(dashboard)/dashboard/analytics/(index)/page.tsx": "redirects to a sub-page",
  "app/(dashboard)/dashboard/delivery/page.tsx": "redirects to delivery/charges",
  "app/(dashboard)/dashboard/notifications/page.tsx": "redirects to notifications/templates",
  "app/(dashboard)/dashboard/notifications/campaigns/new/page.tsx": "redirects to the campaigns list",
  "app/(dashboard)/dashboard/notifications/logs/suppressed/page.tsx": "redirects to notifications/unsubscribed",
  "app/(dashboard)/dashboard/organization/page.tsx": "redirects to organization/overview",
  "app/(dashboard)/dashboard/organization/access/page.tsx": "redirects to organization/people",
  "app/(dashboard)/dashboard/organization/members/page.tsx": "redirects to organization/people",
  "app/(dashboard)/dashboard/organization/invites/page.tsx": "redirects to organization/people",
  "app/(dashboard)/dashboard/catalog/addons/page.tsx": "redirects to catalog/dishes",
  "app/(dashboard)/dashboard/customer-groups/new/page.tsx": "redirects to customer-groups",
  "app/(dashboard)/dashboard/inquiries/renewals/page.tsx": "redirects to inquiries",
  "app/(dashboard)/dashboard/inquiries/renewals/[id]/page.tsx": "re-exports renewals/customers/[id]/page, which guards itself",
  "app/(dashboard)/dashboard/settings/integrations/payments/page.tsx": "redirects to settings/payments",
  "app/(dashboard)/dashboard/settings/integrations/plugins/page.tsx": "redirects to settings/integrations",
};

// Real gaps the scan found, keyed file:export (actions), file (pages, routes). Empty: every public write checks captcha and a per-IP cap first.
const KNOWN_GAPS: string[] = [];

const rel = (p: string) => relative(APP, p).split(sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** Blanks comments but keeps newlines, so declaration line starts survive. `//` after `:` or a quote is a URL or string, not a comment. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, "$1");

const code = (p: string) => stripComments(readFileSync(p, "utf8"));

/** Resolves `@/x` and relative imports to a file on disk; package imports return null. */
function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(APP, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Source of a file plus its local imports, `depth` hops out. */
function closure(file: string, depth = 2, seen = new Set<string>()): string {
  if (seen.has(file)) return "";
  seen.add(file);
  const src = code(file);
  if (depth === 0) return src;
  const specs = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
  const deps = specs.map((s) => resolveLocal(s, file)).filter((p): p is string => !!p);
  return [src, ...deps.map((d) => closure(d, depth - 1, seen))].join("\n");
}

type Decl = { name: string; exported: boolean; isFn: boolean; body: string };

/** Top-level function-ish declarations, split on their starting lines. */
function declarations(src: string): Decl[] {
  const lines = src.split("\n");
  const starts: { line: number; name: string; exported: boolean }[] = [];
  lines.forEach((line, i) => {
    const fn = /^(export\s+)?(async\s+)?function\s+(\w+)/.exec(line);
    const cst = /^(export\s+)?const\s+(\w+)\s*=/.exec(line);
    const m = fn ?? cst;
    if (m) starts.push({ line: i, name: (fn ? fn[3] : cst![2])!, exported: !!m[1] });
  });
  return starts.map((s, i) => {
    const body = lines.slice(s.line, starts[i + 1]?.line ?? lines.length).join("\n");
    return { name: s.name, exported: s.exported, isFn: /^(export\s+)?(async\s+)?function\b|=\s*(async\s*)?(\(|function\b|\w+\s*=>)/m.test(body), body };
  });
}

/** Exported function declared in this file, guarded in its own body or through one same-file helper. */
function exportGuarded(decl: Decl, all: Decl[]): boolean {
  if (ACTION_GUARD.test(decl.body)) return true;
  return all.some((d) => !d.exported && d.name !== decl.name && new RegExp(`\\b${d.name}\\(`).test(decl.body) && ACTION_GUARD.test(d.body));
}

/** Exported functions in one server file, each with whether a guard reaches it. */
function scanActions(source: string): { name: string; guarded: boolean }[] {
  const decls = declarations(stripComments(source));
  return decls.filter((d) => d.exported && d.isFn).map((d) => ({ name: d.name, guarded: exportGuarded(d, decls) }));
}

/** The default export reaches a guard itself: in its body, or in a same-file helper it uses. Imported helpers do not count. */
const pageGuarded = (source: string) => {
  const decls = declarations(stripComments(source).replace(/^export default /m, "export const DefaultPage = "));
  const page = decls.find((d) => d.name === "DefaultPage");
  if (!page) return false;
  if (PAGE_GUARD.test(page.body)) return true;
  return decls.some((d) => !d.exported && d.name !== page.name && new RegExp(`\\b${d.name}\\b`).test(page.body) && PAGE_GUARD.test(d.body));
};

const routeGuarded = (source: string) => ROUTE_GUARD.test(stripComments(source));

const isServerFile = (src: string) => /^["']use server["']/m.test(src.slice(0, 300));

const expectKnownGapsFixed = (bad: string[]) => {
  for (const gap of KNOWN_GAPS) expect(bad, `known gap ${gap} is fixed, drop it from KNOWN_GAPS`).toContain(gap);
};

describe("guard coverage", () => {
  it("every server action export reaches a guard", () => {
    const files = walk(join(APP, "app")).concat(walk(join(APP, "lib"))).filter((f) => isServerFile(code(f)));
    const bad: string[] = [];
    let exports = 0;
    for (const file of files) {
      const r = rel(file);
      for (const { name, guarded } of scanActions(code(file))) {
        exports++;
        const key = `${r}:${name}`;
        if (PUBLIC_ACTIONS[key] || CUSTOMER_SELF_SERVICE_ACTIONS[key]) continue;
        if (!guarded) bad.push(key);
      }
    }
    console.info(`[guard-coverage] server action exports scanned: ${exports} in ${files.length} files`);
    expect(exports).toBeGreaterThan(0);
    expectKnownGapsFixed(bad);
    expect(bad.filter((b) => !KNOWN_GAPS.includes(b))).toEqual([]);
  });

  it("every app/api route handler reaches a guard or is public by design", () => {
    const routes = walk(join(APP, "app", "api")).filter((f) => /\/route\.tsx?$/.test(f));
    const bad: string[] = [];
    for (const file of routes) {
      const r = rel(file);
      if (PUBLIC_ROUTES[r] || SESSION_SCOPED_ROUTES[r]) continue;
      if (!routeGuarded(closure(file))) bad.push(r);
    }
    console.info(`[guard-coverage] route files scanned: ${routes.length}`);
    expect(routes.length).toBeGreaterThan(0);
    expectKnownGapsFixed(bad);
    expect(bad.filter((b) => !KNOWN_GAPS.includes(b))).toEqual([]);
  });

  it("every dashboard page calls its own permission guard", () => {
    const dashRoot = join(APP, "app", "(dashboard)", "dashboard");
    const pages = walk(dashRoot).filter((f) => /\/page\.tsx$/.test(f));
    const bad: string[] = [];
    for (const page of pages) {
      const r = rel(page);
      if (REDIRECT_ONLY_PAGES[r]) continue;
      if (!pageGuarded(code(page))) bad.push(r);
    }
    console.info(`[guard-coverage] dashboard pages scanned: ${pages.length}`);
    expect(pages.length).toBeGreaterThan(0);
    expectKnownGapsFixed(bad);
    expect(bad.filter((b) => !KNOWN_GAPS.includes(b))).toEqual([]);
  });

  it("allowlists and known gaps point at files that still exist and still declare the export", () => {
    const files = [
      ...Object.keys(PUBLIC_ROUTES),
      ...Object.keys(SESSION_SCOPED_ROUTES),
      ...Object.keys(CUSTOMER_SELF_SERVICE_ACTIONS).map((k) => k.split(":")[0]!),
      ...Object.keys(REDIRECT_ONLY_PAGES),
      ...Object.keys(PUBLIC_ACTIONS).map((k) => k.split(":")[0]!),
    ];
    const missing = files.filter((f) => !existsSync(join(APP, f)));
    expect(missing).toEqual([]);
    const staleExports = [...Object.keys(CUSTOMER_SELF_SERVICE_ACTIONS), ...Object.keys(PUBLIC_ACTIONS)].filter((k) => {
      const [file, name] = k.split(":") as [string, string];
      const path = join(APP, file);
      return !existsSync(path) || !declarations(code(path)).some((d) => d.exported && d.name === name);
    });
    expect(staleExports).toEqual([]);
  });
});

describe("guard scanner flags unguarded entry points", () => {
  it("action without a guard, or with one only in a comment", () => {
    const bare = `"use server";
export async function updateOrder(id: string) {
  return db.orders.update(id);
}`;
    const commented = `"use server";
export async function updateOrder(id: string) {
  // await requirePermission({ order: ["write"] });
  return db.orders.update(id);
}`;
    expect(scanActions(bare)).toEqual([{ name: "updateOrder", guarded: false }]);
    expect(scanActions(commented)).toEqual([{ name: "updateOrder", guarded: false }]);
  });

  it("action with a guard call passes", () => {
    const guarded = `"use server";
export async function updateOrder(id: string) {
  await requirePermission({ order: ["write"] });
  return db.orders.update(id);
}`;
    expect(scanActions(guarded)).toEqual([{ name: "updateOrder", guarded: true }]);
  });

  it("page without its own guard, even with <Can> or a comment, is flagged", () => {
    const withCan = `export default async function Page() {
  return <Can perms={{ finance: ["manage"] }}><Export /></Can>;
}`;
    const commented = `/* requirePagePermission({ finance: ["read"] }) */
export default async function Page() {
  return <Export />;
}`;
    expect(pageGuarded(withCan)).toBe(false);
    expect(pageGuarded(commented)).toBe(false);
  });

  it("page with its own requirePagePermission passes", () => {
    const guarded = `export default async function Page() {
  await requirePagePermission({ finance: ["read"] });
  return <Export />;
}`;
    expect(pageGuarded(guarded)).toBe(true);
  });

  it("route with bare words but no guard call is flagged", () => {
    const bare = `export async function GET(req: Request) {
  const session = await getSession();
  if (req.headers.get("x-key") !== CRON_SECRET) return new Response(null, { status: 401 });
  return Response.json(await db.list());
}`;
    const commented = `export async function POST(req: Request) {
  // verifyCronSecret(req) belongs here
  return Response.json(await db.run());
}`;
    expect(routeGuarded(bare)).toBe(false);
    expect(routeGuarded(commented)).toBe(false);
  });

  it("route with a real guard call passes", () => {
    const guarded = `export async function POST(req: Request) {
  if (!verifyCronSecret(req)) return new Response(null, { status: 401 });
  return Response.json(await db.run());
}`;
    expect(routeGuarded(guarded)).toBe(true);
  });

  it("a local function named guard does not count as a guard", () => {
    const localGuard = `"use server";
function guard() {}
export async function updateOrder(id: string) {
  await guard();
  return db.orders.update(id);
}`;
    expect(scanActions(localGuard)).toEqual([{ name: "updateOrder", guarded: false }]);
  });

  it("page whose guard lives only in an imported helper is flagged", () => {
    const viaImport = `import { loadOrder } from "./data";
export default async function Page() {
  return <Export data={await loadOrder()} />;
}`;
    expect(pageGuarded(viaImport)).toBe(false);
  });

  it("page whose same-file helper calls the guard passes", () => {
    const viaHelper = `export default async function Page() {
  return <Body />;
}
async function Body() {
  await requirePagePermission({ order: ["read"] });
  return <Export />;
}`;
    expect(pageGuarded(viaHelper)).toBe(true);
  });
});
