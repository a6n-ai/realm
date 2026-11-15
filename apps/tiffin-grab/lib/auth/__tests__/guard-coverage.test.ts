import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static scan: every entry point must reach a guard. No DB, no request.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const ACTION_GUARD =
  /\b(staffAction|orderAction|guard|requirePermission|requirePermissionIn|assertStaffSession|requireCustomer|requireCustomerId|requireCustomerSession|requireCustomerIdOrRedirect|requireActiveUser|assertCanManage\w*|assertOwn\w*|callerIsStaff|isStaffRole)\(/;
const ROUTE_GUARD =
  /\b(requirePermission|requirePermissionIn|requirePagePermission|assertStaffSession|adminRoute|adminIdRoute|withCronAuth|cronRoutes|cronJobRoute|CRON_SECRET|captcha\w*|constructEvent|stripe-signature|verifySignature\w*|verifyWebhook\w*|getSession|requireCustomer\w*|requireActiveUser)\b/;
const PAGE_GUARD = /\b(requirePagePermission|requirePermission|requirePermissionIn|assertStaffSession)\(|<Can\b/;

const HTTP = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

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
};

// Customer self-service actions: getSession plus an ownership check on the row they touch.
// Keep this list short. A file belongs here only if every export acts on the caller's own data.
const CUSTOMER_SELF_SERVICE_ACTIONS: Record<string, string> = {
  "lib/deliveries/customer-actions.ts": "currentUserId scopes every read and write to the caller's own orders",
  "lib/support/customer-actions.ts": "currentUserId scopes tickets to the caller",
  "lib/referrals/customer-actions.ts": "currentUserId scopes the referral code to the caller",
  "lib/payments/customer-actions.ts": "requireCustomerId and currentUserId, the caller's own payments",
  "lib/payments/card-actions.ts": "getSession, removes only the caller's saved cards",
  "lib/payments/pay-actions.ts": "requireCustomer or getSession before any payment session",
  "lib/account/actions.ts": "requireCustomer, the caller's own account",
  "lib/checkout/actions.ts": "getSession or currentUserId for signed-in checkout",
  "app/(customer)/me/review-nudge-actions.ts": "getSession, marks the caller's own review nudge",
  "app/(auth)/set-password/actions.ts": "getSession, sets the caller's own password",
  "app/(auth)/login/actions.ts": "getSession, PIN check for the caller's own session",
  "lib/services/filter-usage.actions.ts": "per-user filter preferences, the service reads getSession",
  "lib/services/section-seen.actions.ts": "per-user seen markers, the service reads getSession",
};

// Actions that are public or self-authenticating by design, keyed file:export.
const PUBLIC_ACTIONS: Record<string, string> = {
  "app/(auth)/accept-invitation/actions.ts:acceptInvitationAction": "invitation token is the credential",
  "app/(public)/resubscribe/actions.ts:confirmResubscribe": "resubscribe token checked by handleResubscribe",
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

// Dashboard pages that only redirect and render no data.
const REDIRECT_ONLY_PAGES: Record<string, string> = {
  "app/(dashboard)/dashboard/payments/page.tsx": "redirects to a sub-page",
  "app/(dashboard)/dashboard/analytics/page.tsx": "redirects to a sub-page",
};

// Real gaps the scan found, keyed file:export. The test fails when one closes, so drop it then.
const KNOWN_GAPS: string[] = [
  // TODO: public form with no captcha; add the captcha check, then drop this entry.
  "lib/landing/contact-actions.ts:createWebsiteInquiry",
  // TODO: public account lookup by email reveals whether an account exists; rate-limit or drop the detail.
  "lib/wizard/actions.ts:checkExistingAccount",
  // TODO: public account creation with no captcha or rate limit.
  "lib/wizard/actions.ts:createCheckoutAccount",
];

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

const read = (p: string) => readFileSync(p, "utf8");

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
  const src = read(file);
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
function exportGuarded(src: string, decl: Decl, all: Decl[]): boolean {
  if (ACTION_GUARD.test(decl.body)) return true;
  return all.some((d) => !d.exported && d.name !== decl.name && new RegExp(`\\b${d.name}\\(`).test(decl.body) && ACTION_GUARD.test(d.body));
}

const isServerFile = (src: string) => /^["']use server["']/m.test(src.slice(0, 300));

describe("guard coverage", () => {
  it("every server action export reaches a guard", () => {
    const files = walk(join(APP, "app")).concat(walk(join(APP, "lib"))).filter((f) => isServerFile(read(f)));
    const bad: string[] = [];
    let exports = 0;
    for (const file of files) {
      const r = rel(file);
      if (CUSTOMER_SELF_SERVICE_ACTIONS[r]) continue;
      const src = read(file);
      const decls = declarations(src);
      for (const d of decls) {
        if (!d.exported || !d.isFn) continue;
        exports++;
        const key = `${r}:${d.name}`;
        if (PUBLIC_ACTIONS[key]) continue;
        if (!exportGuarded(src, d, decls)) bad.push(key);
      }
    }
    console.info(`[guard-coverage] server action exports scanned: ${exports} in ${files.length} files`);
    expect(exports).toBeGreaterThan(0);
    for (const gap of KNOWN_GAPS) expect(bad, `known gap ${gap} is fixed, drop it from KNOWN_GAPS`).toContain(gap);
    expect(bad.filter((b) => !KNOWN_GAPS.includes(b))).toEqual([]);
  });

  it("every app/api route handler reaches a guard or is public by design", () => {
    const routes = walk(join(APP, "app", "api")).filter((f) => /\/route\.tsx?$/.test(f));
    const bad: string[] = [];
    for (const file of routes) {
      const r = rel(file);
      if (PUBLIC_ROUTES[r]) continue;
      if (!ROUTE_GUARD.test(closure(file))) bad.push(r);
    }
    console.info(`[guard-coverage] route files scanned: ${routes.length}`);
    expect(routes.length).toBeGreaterThan(0);
    expect(bad.filter((b) => !KNOWN_GAPS.includes(b))).toEqual([]);
  });

  it("every dashboard page calls a permission guard or sits under a guarded layout", () => {
    const dashRoot = join(APP, "app", "(dashboard)", "dashboard");
    const pages = walk(dashRoot).filter((f) => /\/page\.tsx$/.test(f));
    const bad: string[] = [];
    for (const page of pages) {
      const r = rel(page);
      if (REDIRECT_ONLY_PAGES[r]) continue;
      if (PAGE_GUARD.test(closure(page, 1))) continue;
      // Ancestor layouts from the page's directory up to the dashboard root.
      let dir = dirname(page);
      let covered = false;
      while (dir.startsWith(dashRoot)) {
        const layout = join(dir, "layout.tsx");
        if (existsSync(layout) && PAGE_GUARD.test(closure(layout, 1))) {
          covered = true;
          break;
        }
        dir = dirname(dir);
      }
      if (!covered) bad.push(r);
    }
    console.info(`[guard-coverage] dashboard pages scanned: ${pages.length}`);
    expect(pages.length).toBeGreaterThan(0);
    expect(bad.filter((b) => !KNOWN_GAPS.includes(b))).toEqual([]);
  });

  it("allowlists and known gaps point at files that still exist", () => {
    const files = [
      ...Object.keys(PUBLIC_ROUTES),
      ...Object.keys(CUSTOMER_SELF_SERVICE_ACTIONS),
      ...Object.keys(REDIRECT_ONLY_PAGES),
      ...Object.keys(PUBLIC_ACTIONS).map((k) => k.split(":")[0]!),
    ];
    const missing = files.filter((f) => !existsSync(join(APP, f)));
    expect(missing).toEqual([]);
  });
});
