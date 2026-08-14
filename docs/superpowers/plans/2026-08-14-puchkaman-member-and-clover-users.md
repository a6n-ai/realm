# Puchkaman `member` Enablement + Clover Employee Users — Implementation Plan (Slice 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `member` a usable staff role, then have the Clover employee sync create and link `member` accounts.

**Architecture:** The permission map in `lib/auth/permissions.ts` already grants `member` `product:read`, `order:[read,write]`, `finance:read`. This slice applies that map — swapping `requireAdmin` for `requirePermission` on the ~10 surfaces `member` should reach (leaving 26 files admin-only), auditing the matching API routes, filtering the nav, and only then re-admitting `member` to `/dashboard`. With a usable console in place, `employees` gains a `user_id` link and the Clover sync provisions credential-less `member` rows.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), Better Auth (`admin` plugin access control), Drizzle ORM on Postgres, Vitest, `@realm/design-system` filter framework, `@realm/clover`.

**Spec:** `docs/superpowers/specs/2026-08-14-puchkaman-customer-accounts-design.md` (Slice 2 section, revised 2026-08-14)

## Global Constraints

- Work in the worktree `/Users/lawbringr/IdeaProjects/realm-wt-3c88e511` on branch `wt/3c88e511`. Never the shared checkout at `/Users/lawbringr/IdeaProjects/realm`.
- `docs/` is gitignored (`.gitignore:63`); doc commits need `git add -f`.
- Verify after each task: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`. Before the final task, also `pnpm --filter puchkaman build`.
- `tsc` cannot catch: a stripped `"use client"` directive, or a client symbol demoted from a named export. Check both by eye on every client component touched.
- Never rewrite an applied migration. Next number is `0018`.
- `psql` is at `/Applications/Postgres.app/Contents/Versions/latest/bin/psql` (not on PATH). DB `postgres://localhost:5432/puchkaman`.
- **`lib/auth/permissions.ts` imports `@realm/auth`, which is server-only and NOT in `transpilePackages`.** It must never be imported into a client component. This constrains Task 3.
- `requireAdmin()` remains correct for the 26 admin-only files. Do not convert guards this plan does not name.
- Comment the non-obvious *why* only. `rg`/`fd` over `grep`/`find`.

## The permission map this slice applies

Authoritative; every task refers back to it.

| Surface | Guard | member |
|---|---|---|
| `dashboard/orders/page.tsx`, `orders/[id]/page.tsx` | `requirePermission({ order: ["read"] })` | yes |
| `dashboard/products/page.tsx`, `products/[id]/page.tsx` | `requirePermission({ product: ["read"] })` | yes (read-only) |
| `dashboard/finance/layout.tsx`, `finance/ledger/page.tsx`, `finance/transactions/page.tsx` | `requirePermission({ finance: ["read"] })` | yes |
| `dashboard/account/page.tsx` | staff session only (no permission) | yes |
| `dashboard/page.tsx` (home) | staff session; cards gated individually | partial |
| `api/orders/**` reads | `order:["read"]` | yes |
| `api/orders/**` mutations | `order:["write"]` | yes |
| `api/products/**` reads | `product:["read"]` | yes |
| `api/products/**` writes / sync / delete / clover-link | `product:["write"]` or `product:["sync"]` | **no** |
| everything else (`settings/*`, `notifications/*`, `logs`, `clover/*`, `settings/users`) | unchanged `requireAdmin` | no |

---

### Task 1: Open the read surfaces to `member`

**Files:**
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/orders/page.tsx`, `orders/[id]/page.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/products/page.tsx`, `products/[id]/page.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/finance/layout.tsx`, `finance/ledger/page.tsx`, `finance/transactions/page.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/account/page.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/page.tsx`
- Create: `apps/puchkaman/lib/auth/__tests__/member-surfaces.test.ts`

**Interfaces:**
- Consumes: `requirePermission`, `roleCan` from `apps/puchkaman/lib/auth/guards.ts`.
- Produces: nothing new. Task 3 relies on `roleCan` being usable server-side; Task 4 relies on these pages no longer throwing for `member`.

`requireAdmin()` throws `ForbiddenError`, and the app has no `error.tsx`, so every one of these pages currently 500s for a `member`. Nine files change here; the other 26 `requireAdmin` files are deliberately untouched.

- [ ] **Step 1: Write the failing test**

This test pins the map itself rather than each page, because the map is the thing a future edit will get wrong. Create `apps/puchkaman/lib/auth/__tests__/member-surfaces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { roleCan } from "@/lib/auth/guards";

/**
 * The console surfaces member is meant to reach. If a future permission edit
 * silently drops one of these, a synced Clover employee loses the job they were
 * synced to do — with no error anywhere, just a 403 they cannot explain.
 */
describe("member reaches its intended surfaces", () => {
  it.each([
    ["orders list", { order: ["read"] }],
    ["order detail", { order: ["read"] }],
    ["order mutations", { order: ["write"] }],
    ["products list", { product: ["read"] }],
    ["finance", { finance: ["read"] }],
  ])("member may open %s", (_label, permissions) => {
    expect(roleCan(Role.MEMBER, permissions as never)).toBe(true);
  });

  it.each([
    ["product writes", { product: ["write"] }],
    ["product sync", { product: ["sync"] }],
    ["settings", { settings: ["read"] }],
    ["audit logs", { audit: ["read"] }],
    ["clover admin", { clover: ["read"] }],
    ["staff invites", { staff: ["invite"] }],
    ["user listing", { user: ["list"] }],
  ])("member may NOT reach %s", (_label, permissions) => {
    expect(roleCan(Role.MEMBER, permissions as never)).toBe(false);
  });

  it("admin reaches everything member does", () => {
    for (const p of [{ order: ["read"] }, { product: ["read"] }, { finance: ["read"] }]) {
      expect(roleCan(Role.ADMIN, p as never)).toBe(true);
    }
  });

  it("a customer reaches no console surface at all", () => {
    for (const p of [{ order: ["read"] }, { product: ["read"] }, { finance: ["read"] }]) {
      expect(roleCan(Role.USER, p as never)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes or fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/member-surfaces.test.ts`

This one may pass immediately — it pins the existing permission map, which is already correct. That is fine and expected: its value is as a regression guard for the guard swaps below. If any case FAILS, stop and report: it means the permission map disagrees with the spec's table, which is a design question, not an implementation detail.

- [ ] **Step 3: Swap the guards**

In each file below, replace the `requireAdmin()` call with the mapped `requirePermission({...})`, and update the import on the same line-range from `requireAdmin` to `requirePermission` (keep `requireAdmin` imported only if another call in the same file still uses it).

- `orders/page.tsx` → `await requirePermission({ order: ["read"] });`
- `orders/[id]/page.tsx` → `await requirePermission({ order: ["read"] });`
- `products/page.tsx` → `await requirePermission({ product: ["read"] });`
- `products/[id]/page.tsx` → `await requirePermission({ product: ["read"] });`
- `finance/layout.tsx` → `await requirePermission({ finance: ["read"] });`
- `finance/ledger/page.tsx` → `await requirePermission({ finance: ["read"] });`
- `finance/transactions/page.tsx` → `await requirePermission({ finance: ["read"] });`

Locate each by content — line numbers in this plan are not authoritative.

- [ ] **Step 4: Open the account page to any staff session**

`account/page.tsx` is a member's own profile and security page; gating it on `admin` locks them out of their own account. It needs a session, not a permission. Replace its `await requireAdmin();` with:

```ts
  // Own-account page: any signed-in staff member may manage their own profile.
  // The customer equivalent lives at /me/account; the dashboard layout has
  // already bounced role "user" before this runs.
  const session = await getSession();
  if (!session?.user) redirect("/login");
```

Add `getSession` from `@/lib/auth/session` and `redirect` from `next/navigation` to the imports if absent. If the file already reads the session for its own rendering, reuse that call rather than adding a second.

- [ ] **Step 5: Gate the dashboard home per card**

`dashboard/page.tsx` has an async `DashboardData()` whose first statement is `await requireAdmin();`. Replace that with a session check plus per-section permission checks, so a member sees the parts they may see:

```ts
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  // Each card is gated by the permission its data needs, so the home page
  // degrades to what the viewer may actually open rather than 403-ing whole.
  const canOrders = roleCan(role, { order: ["read"] });
  const canProducts = roleCan(role, { product: ["read"] });
```

Then wrap each existing card/section in the matching flag. Read the file first: fetch only the data the viewer may see — do not fetch everything and hide it in the markup, because the fetch itself is the disclosure. If a stat aggregates data across several permissions, gate it on the most restrictive one and say so in your report.

- [ ] **Step 6: Verify no remaining member-facing `requireAdmin`**

Run: `cd apps/puchkaman && rg -n 'requireAdmin' 'app/(dashboard)/dashboard/orders' 'app/(dashboard)/dashboard/products' 'app/(dashboard)/dashboard/finance' 'app/(dashboard)/dashboard/account' 'app/(dashboard)/dashboard/page.tsx'`
Expected: no matches.

Then confirm the untouched set is intact:
Run: `cd apps/puchkaman && rg -c 'requireAdmin\(' 'app/(dashboard)' | wc -l`
Expected: 27 files (36 before, 9 converted). If the number differs, you converted something this plan did not name — report it.

- [ ] **Step 7: Run the suite and typecheck**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/puchkaman/app/\(dashboard\)/dashboard apps/puchkaman/lib/auth/__tests__/member-surfaces.test.ts
git commit -m "feat(puchkaman): open orders, products, finance and account to member"
```

---

### Task 2: Audit the order and product API routes

**Files:**
- Modify: every route under `apps/puchkaman/app/api/orders/` and `apps/puchkaman/app/api/products/`
- Create: `apps/puchkaman/app/api/__tests__/route-guards.test.ts`

**Interfaces:**
- Consumes: `requirePermission` from `apps/puchkaman/lib/auth/guards.ts`.
- Produces: nothing consumed by later tasks.

A page guard does nothing for a direct `fetch`. `member` now reaches the orders and products UI, so the routes those screens call must agree with the page guards — and the ones `member` must NOT reach have to stay closed. Known routes (verify the full list yourself with `fd . app/api/orders app/api/products -e ts`):

- `api/orders/[id]/assign-employee/route.ts` → `order:["write"]`
- `api/orders/[id]/payment-status/route.ts` → `order:["read"]` if it only reads Clover status; `order:["write"]` if it mutates local payment state. **Read the handler and decide from what it does**, then say which in your report.
- `api/products/route.ts` (`createCollectionRoute`) → GET needs `product:["read"]`; POST needs `product:["write"]`. If the route factory takes a single `guard` for all methods, use `product:["write"]` for the whole route and note the coarseness — do NOT weaken POST to `read` to make GET work.
- `api/products/[id]/route.ts` (`createResourceRoute`) → same rule.
- `api/products/query/route.ts` → `product:["read"]`
- `api/products/sync/**`, `products/[id]/clover-sync`, `products/[id]/clover-link`, `products/[id]/associations`, `products/delete-all` → `product:["sync"]` for sync operations, `product:["write"]` for the rest. `member` holds neither, so these stay closed to them.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/app/api/__tests__/route-guards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { roleCan } from "@/lib/auth/guards";

/**
 * Page guards do not protect a direct fetch. These pin the permission each
 * route family must demand, so a member can drive the screens they were given
 * and nothing more.
 */
describe("order and product route permissions", () => {
  it("member may read and write orders", () => {
    expect(roleCan(Role.MEMBER, { order: ["read"] } as never)).toBe(true);
    expect(roleCan(Role.MEMBER, { order: ["write"] } as never)).toBe(true);
  });

  it("member may read products but never write or sync them", () => {
    expect(roleCan(Role.MEMBER, { product: ["read"] } as never)).toBe(true);
    expect(roleCan(Role.MEMBER, { product: ["write"] } as never)).toBe(false);
    expect(roleCan(Role.MEMBER, { product: ["sync"] } as never)).toBe(false);
  });

  it("a customer may not touch any of them", () => {
    for (const p of [{ order: ["read"] }, { order: ["write"] }, { product: ["read"] }]) {
      expect(roleCan(Role.USER, p as never)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/puchkaman && pnpm vitest run app/api/__tests__/route-guards.test.ts`
Expected: PASS (it pins the map). If the vitest `include` globs do not pick up `app/api/**`, check `vitest.config.ts` — `app/**/*.test.ts` is already included, so it should. If it is genuinely not collected, move the file under `lib/auth/__tests__/` rather than widening the config.

- [ ] **Step 3: Apply the guards**

Convert each route per the table above. For the `createCollectionRoute` / `createResourceRoute` factories, read the factory signature first (`rg -n 'createCollectionRoute|createResourceRoute' packages apps/puchkaman/lib`) to see whether `guard` is per-method or per-route, and follow the rule in the file list above.

- [ ] **Step 4: Confirm nothing under products got weakened**

Run: `cd apps/puchkaman && rg -n 'requirePermission|requireAdmin' app/api/products`
Every write, sync, delete, clover-link and associations route must demand `product:["write"]` or `product:["sync"]` — never `read`. Read the output and confirm line by line; paste it into your report.

- [ ] **Step 5: Verify**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/puchkaman/app/api
git commit -m "feat(puchkaman): match order and product route guards to the permission map"
```

---

### Task 3: Filter the nav by permission

**Files:**
- Modify: `apps/puchkaman/components/dashboard/app-sidebar.tsx`
- Modify: `apps/puchkaman/components/dashboard/more-drawer.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/layout.tsx`
- Create: `apps/puchkaman/components/dashboard/__tests__/nav-permissions.test.ts`

**Interfaces:**
- Consumes: `roleCan` from `lib/auth/guards.ts` (server side only).
- Produces:
  - `type NavItem` gains `permission?: Record<string, string[]>`
  - `getNavSections(opts: { statuses: PluginCatalogStatus; granted?: string[] }): NavSection[]`
  - `grantedKeys(role: RoleValue): string[]` exported from `apps/puchkaman/lib/auth/nav-permissions.ts`, returning entries like `"order:read"`
  - Task 4 relies on this, because re-admitting `member` without it shows nav for pages that 403.

**The constraint that shapes this task:** `app-sidebar.tsx` and `more-drawer.tsx` are **client** components, and `lib/auth/permissions.ts` imports `@realm/auth`, a server-only package deliberately absent from `transpilePackages`. Importing `roleCan` into either component would pull server-only code into the browser bundle. So the server computes a plain list of granted `"resource:action"` strings and passes it down as data; the client filters by string membership only.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/components/dashboard/__tests__/nav-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { grantedKeys } from "@/lib/auth/nav-permissions";
import { getNavSections } from "../app-sidebar";

const hrefs = (granted: string[]) =>
  getNavSections({ statuses: {}, granted }).flatMap((s) => s.items.map((i) => i.href));

describe("nav filtering", () => {
  it("gives an admin the full nav", () => {
    const all = hrefs(grantedKeys(Role.ADMIN));
    expect(all).toContain("/dashboard/settings");
    expect(all).toContain("/dashboard/orders");
    expect(all).toContain("/dashboard/logs");
  });

  it("hides admin-only destinations from a member", () => {
    const mine = hrefs(grantedKeys(Role.MEMBER));
    expect(mine).toContain("/dashboard/orders");
    expect(mine).toContain("/dashboard/products");
    expect(mine).toContain("/dashboard/finance");
    expect(mine).toContain("/dashboard/account");
    expect(mine).not.toContain("/dashboard/settings");
    expect(mine).not.toContain("/dashboard/logs");
    expect(mine).not.toContain("/dashboard/notifications");
    expect(mine).not.toContain("/dashboard/settings/integrations");
  });

  it("omitting granted keeps every item, so existing callers are unchanged", () => {
    expect(hrefs.length).toBeGreaterThan(0);
    const all = getNavSections({ statuses: {} }).flatMap((s) => s.items);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((i) => i.href === "/dashboard/settings")).toBe(true);
  });

  it("drops a section that has no visible items rather than leaving an empty heading", () => {
    const sections = getNavSections({ statuses: {}, granted: grantedKeys(Role.MEMBER) });
    for (const s of sections) expect(s.items.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run components/dashboard/__tests__/nav-permissions.test.ts`
Expected: FAIL — `@/lib/auth/nav-permissions` does not exist.

- [ ] **Step 3: Write the server-side granted-key helper**

Create `apps/puchkaman/lib/auth/nav-permissions.ts`:

```ts
import type { RoleValue } from "@realm/commons";
import { roleCan } from "./guards";

/**
 * Every permission the nav can gate on, as flat "resource:action" strings.
 *
 * The nav components are client components, and permissions.ts pulls in
 * server-only @realm/auth, so the browser can never evaluate roleCan itself.
 * The server resolves the role to this plain list and the client filters by
 * string membership — data crosses the boundary, code does not.
 */
const NAV_PERMISSIONS: Array<[string, Record<string, string[]>]> = [
  ["order:read", { order: ["read"] }],
  ["product:read", { product: ["read"] }],
  ["finance:read", { finance: ["read"] }],
  ["settings:read", { settings: ["read"] }],
  ["audit:read", { audit: ["read"] }],
  ["clover:read", { clover: ["read"] }],
  ["user:list", { user: ["list"] }],
];

export function grantedKeys(role: RoleValue): string[] {
  return NAV_PERMISSIONS.filter(([, p]) => roleCan(role, p as never)).map(([key]) => key);
}
```

- [ ] **Step 4: Tag the nav items and filter**

In `apps/puchkaman/components/dashboard/app-sidebar.tsx`:

Extend the type (keep it a plain serialisable string so it can cross to the client):

```ts
export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** "resource:action" this destination needs. Absent means always visible. */
  permission?: string;
};
```

Tag each item using the map at the top of this plan: `Products` → `product:read`; `Orders` → `order:read`; `Finance` → `finance:read`; `Logs` → `audit:read`; `Notifications`, `Settings`, `Delivery`, `Integrations` → `settings:read`; every `CLOVER_CATALOG_ITEMS` entry and the Clover plugin items → `clover:read`; `Dashboard` and `Account` stay untagged (any staff session may open them).

Then change the signature and filter:

```ts
export function getNavSections(opts: {
  statuses: PluginCatalogStatus;
  /** Granted "resource:action" keys. Omitted means unfiltered — existing callers keep today's behaviour. */
  granted?: string[];
}): NavSection[] {
  // …build `sections` exactly as today…
  if (!opts.granted) return sections;
  const allowed = new Set(opts.granted);
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || allowed.has(i.permission)) }))
    // An empty section would render as a heading with nothing under it.
    .filter((s) => s.items.length > 0);
}
```

- [ ] **Step 5: Thread `granted` from the server layout**

`AppSidebar` and `MoreDrawer` both call `getNavSections` internally. Add a `granted?: string[]` prop to each, pass it straight through to `getNavSections`, and supply it from `app/(dashboard)/dashboard/layout.tsx` (a server component) with `grantedKeys(session.user.role)`.

`AppBottomNav` also renders navigation — check whether it derives from `getNavSections` or its own list, and filter it the same way if it has admin-only destinations. Report what you found.

Confirm `"use client"` is still line 1 of both `app-sidebar.tsx` and `more-drawer.tsx`, and that `AppSidebar` / `MoreDrawer` / `getNavSections` / `NavItem` / `NavSection` all remain named exports.

- [ ] **Step 6: Prove no server-only code reached the browser**

This is the failure mode `tsc` will not catch. Run:

Run: `pnpm --filter puchkaman build`
Expected: SUCCESS. A server-only import pulled into a client component fails here (or at runtime); if the build breaks with a module-resolution or "server-only" error, the `granted` list is being computed in the wrong place — move the computation to the layout, do not add the package to `transpilePackages`.

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS, including the 4 new nav tests.

- [ ] **Step 8: Commit**

```bash
git add apps/puchkaman/components/dashboard apps/puchkaman/lib/auth/nav-permissions.ts apps/puchkaman/app/\(dashboard\)/dashboard/layout.tsx
git commit -m "feat(puchkaman): filter dashboard nav by permission"
```

---

### Task 4: Re-admit `member` to the dashboard

**Files:**
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/layout.tsx`
- Modify: `apps/puchkaman/lib/auth/landing.ts`
- Modify: `apps/puchkaman/lib/auth/__tests__/landing.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: no new symbols.

Slice 1 sent `member` to `/no-access` because every dashboard page threw for them. Tasks 1-3 removed that. This is the flip, and it must come last of the four so `member` never has a half-built console on any commit.

- [ ] **Step 1: Update the landing test first**

In `apps/puchkaman/lib/auth/__tests__/landing.test.ts`, `member` currently expects `/no-access`. Change those cases so `member` lands on `/dashboard` and may follow a `/dashboard/...` callback, and add a case pinning that an unknown role still goes somewhere safe:

```ts
  it("sends a member to the dashboard now that it has pages for them", () => {
    expect(landingPathFor("member")).toBe("/dashboard");
  });

  it("lets a member follow a dashboard callback", () => {
    expect(landingPathFor("member", "/dashboard/orders")).toBe("/dashboard/orders");
  });

  it("still sends an unknown role to the customer area, never the console", () => {
    expect(landingPathFor("something-new")).toBe("/me");
  });
```

Keep every existing admin, customer, and off-site-callback case unchanged.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/landing.test.ts`
Expected: FAIL — member still resolves to `/no-access`.

- [ ] **Step 3: Update `landing.ts`**

Restore `member` to the staff home. Find the helper slice 1 added (`homeFor` or equivalent) and make `admin` and `member` both resolve to `/dashboard`, leaving every other role on `/me`. `/no-access` stays reachable as a destination — it is still where the dashboard layout sends an authenticated role with no pages — but it is no longer any role's landing.

- [ ] **Step 4: Update the dashboard layout**

Change the gate so `admin` and `member` are admitted, `user` goes to `/me`, and any other authenticated role goes to `/no-access`:

```ts
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.USER) redirect("/me");
  // Any future staff role with no pages of its own still gets the explainer
  // rather than a 403 from the first component that tries to load data.
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) redirect("/no-access");
```

Import `Role` from `@realm/commons` if it is not already imported.

- [ ] **Step 5: Trace every redirect pair**

Write out, in your report, what happens for `admin`, `member`, `user`, and signed-out against `/dashboard`, `/me`, `/no-access`, and `/login`. Confirm no pair can ping-pong. A member must now terminate ON `/dashboard`, not bounce.

- [ ] **Step 6: Verify**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/app/\(dashboard\)/dashboard/layout.tsx apps/puchkaman/lib/auth/landing.ts apps/puchkaman/lib/auth/__tests__/landing.test.ts
git commit -m "feat(puchkaman): admit member to the dashboard"
```

---

### Task 5: Link `employees` to `users`

**Files:**
- Modify: `apps/puchkaman/db/schema/employees.ts`
- Create: `apps/puchkaman/db/migrations/0018_*.sql` (generated)
- Create: `apps/puchkaman/db/__tests__/employees-user-link.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `employees.userId` — a nullable, unique bigint FK to `users.id`. Task 6 writes it.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/db/__tests__/employees-user-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { employees } from "@/db/schema";

/**
 * One employee maps to at most one auth account, and an employee without an
 * email has none at all — so the column must be nullable AND unique. Nullable
 * without unique would let one user row be claimed by two employees.
 */
describe("employees.user_id", () => {
  it("exists", () => {
    expect(employees.userId).toBeDefined();
  });

  it("is nullable — an employee with no email gets no account", () => {
    expect(employees.userId.notNull).toBe(false);
  });

  it("is unique — two employees cannot share one auth account", () => {
    expect(employees.userId.isUnique).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run db/__tests__/employees-user-link.test.ts`
Expected: FAIL — `employees.userId` is undefined.

If `.notNull` / `.isUnique` are not the property names drizzle exposes on a column, use whatever it does expose (or `getTableConfig`) — the requirement is asserting nullable-and-unique, not these exact accessors.

- [ ] **Step 3: Add the column**

In `apps/puchkaman/db/schema/employees.ts`, add to the table definition:

```ts
  // A Clover employee maps to at most one auth account. Nullable because an
  // employee with no email has no key to create a user row from; unique so one
  // account cannot be claimed by two employees.
  userId: bigint("user_id", { mode: "bigint" }).references(() => users.id).unique(),
```

Import `users` from `./auth` and `bigint` from `drizzle-orm/pg-core` if absent. Match the `bigint` mode used by the other FK columns in this repo — check `orders.userId` in `db/schema/orders.ts` and mirror it exactly.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run db/__tests__/employees-user-link.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Generate and inspect the migration**

Run: `pnpm --filter puchkaman db:generate`

Open the generated `0018_*.sql`. It must contain ONLY the `ADD COLUMN`, its unique constraint, and the FK. If drizzle-kit emitted anything else — a dropped index, a recreated enum, a missing `id_seq`/`next_id`/`current_app_id` default, a dropped `app_id` FK DO-block — STOP and report rather than applying. This repo has a known drizzle-kit squash bug of that shape. Do not edit any migration numbered 0017 or lower.

- [ ] **Step 6: Apply and verify**

Run: `pnpm --filter puchkaman db:migrate`

```bash
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
psql "postgres://localhost:5432/puchkaman" -c "\d employees" | rg 'user_id'
```
Expected: the column, its unique index, and the FK to `users(id)`.

- [ ] **Step 7: Verify and commit**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`

```bash
git add apps/puchkaman/db
git commit -m "feat(puchkaman): link employees to auth users"
```

---

### Task 6: Sync provisions and links `member` accounts

**Files:**
- Modify: `apps/puchkaman/lib/sync/clover-employees-sync.service.ts`
- Modify: `apps/puchkaman/lib/services/employees.repository.ts` (only if a new lookup is needed)
- Create: `apps/puchkaman/lib/sync/__tests__/employee-user-link.test.ts`

**Interfaces:**
- Consumes: `employees.userId` (Task 5).
- Produces: `resolveEmployeeUser(emp: { email?: string | null }, deps: EmployeeUserDeps): Promise<bigint | null>` exported from `lib/sync/clover-employees-sync.service.ts`, plus `type EmployeeUserDeps = { findUserByEmail: (email: string) => Promise<{ id: bigint } | null>; createMemberUser: (email: string, name: string) => Promise<bigint> }`.
- Task 7 surfaces the result; Task 8 triggers it.

Rules, from the spec: create on email only; role `member` **on create only** so a manual promotion to `admin` survives a re-sync; **no email is ever sent** — the admin clicks Invite separately, which keeps the sync idempotent and safe to schedule; and employee deactivation must NOT touch `users.status`.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/sync/__tests__/employee-user-link.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveEmployeeUser, type EmployeeUserDeps } from "../clover-employees-sync.service";

function deps(over: Partial<EmployeeUserDeps> = {}): EmployeeUserDeps {
  return {
    findUserByEmail: vi.fn(async () => null),
    createMemberUser: vi.fn(async () => 99n),
    ...over,
  };
}

describe("resolveEmployeeUser", () => {
  it("creates a member account for an employee with an email", async () => {
    const d = deps();
    const id = await resolveEmployeeUser({ email: "cook@shop.com", name: "Cook" }, d);
    expect(id).toBe(99n);
    expect(d.createMemberUser).toHaveBeenCalledWith("cook@shop.com", "Cook");
  });

  it("links to an existing account instead of creating a second one", async () => {
    const d = deps({ findUserByEmail: vi.fn(async () => ({ id: 7n })) });
    const id = await resolveEmployeeUser({ email: "cook@shop.com", name: "Cook" }, d);
    expect(id).toBe(7n);
    expect(d.createMemberUser).not.toHaveBeenCalled();
  });

  it("never rewrites the role of an existing account, so an admin stays an admin", async () => {
    const d = deps({ findUserByEmail: vi.fn(async () => ({ id: 7n })) });
    await resolveEmployeeUser({ email: "boss@shop.com", name: "Boss" }, d);
    expect(d.createMemberUser).not.toHaveBeenCalled();
  });

  it("returns null for an employee with no email — there is no key to match on", async () => {
    const d = deps();
    expect(await resolveEmployeeUser({ email: null, name: "Walk In" }, d)).toBeNull();
    expect(d.createMemberUser).not.toHaveBeenCalled();
    expect(d.findUserByEmail).not.toHaveBeenCalled();
  });

  it("treats a blank or whitespace email as no email", async () => {
    const d = deps();
    expect(await resolveEmployeeUser({ email: "   ", name: "Walk In" }, d)).toBeNull();
    expect(d.createMemberUser).not.toHaveBeenCalled();
  });

  it("normalises the email before matching, so casing cannot fork an account", async () => {
    const d = deps();
    await resolveEmployeeUser({ email: "  Cook@Shop.com ", name: "Cook" }, d);
    expect(d.findUserByEmail).toHaveBeenCalledWith("cook@shop.com");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/sync/__tests__/employee-user-link.test.ts`
Expected: FAIL — `resolveEmployeeUser` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/puchkaman/lib/sync/clover-employees-sync.service.ts`:

```ts
export type EmployeeUserDeps = {
  findUserByEmail: (email: string) => Promise<{ id: bigint } | null>;
  createMemberUser: (email: string, name: string) => Promise<bigint>;
};

/**
 * The auth account behind a Clover employee, if one can exist.
 *
 * Employees are keyed on clover_employee_id, users on email — an employee with
 * no email has no key to match or create on, so it simply gets no account. An
 * existing row is linked, never rewritten: a colleague promoted to admin here
 * must not be demoted by the next POS sync.
 */
export async function resolveEmployeeUser(
  emp: { email?: string | null; name: string },
  deps: EmployeeUserDeps,
): Promise<bigint | null> {
  const email = emp.email?.trim().toLowerCase();
  if (!email) return null;
  const existing = await deps.findUserByEmail(email);
  if (existing) return existing.id;
  return deps.createMemberUser(email, emp.name);
}
```

Then wire it into `upsert()` so the resolved id is written to `employees.userId` in the same patch. The live `createMemberUser` must insert a `users` row with `role: "member"`, `status: "active"`, `passwordSet: false`, and **no `account` row and no email send** — mirror what `lib/customers/upsert-customer.ts` does for customers, but with the member role. Do NOT call `inviteUser`: that mails an OTP, and this sync must stay silent.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run lib/sync/__tests__/employee-user-link.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Confirm deactivation still leaves `users.status` alone**

Read the deactivation pass in `pull()`. It must continue to set only `employees.active = false`. Confirm by inspection and state it in your report; if you changed it, revert — revoking console access is a deliberate admin action, not a POS side effect.

- [ ] **Step 6: Verify and commit**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`

```bash
git add apps/puchkaman/lib/sync apps/puchkaman/lib/services/employees.repository.ts
git commit -m "feat(puchkaman): clover employee sync provisions linked member accounts"
```

---

### Task 7: Users list onto the facet framework

**Files:**
- Modify: `apps/puchkaman/lib/services/users.service.ts`
- Modify: `apps/puchkaman/lib/services/users.repository.ts`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/page.tsx`
- Create: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/users-table.tsx`
- Create: `apps/puchkaman/lib/services/__tests__/users-query.test.ts`

**Interfaces:**
- Consumes: `FacetDef`, `parseFilterState`, `DataTable`, `ListPagination`, `SkeletonFilterBar` from `@realm/design-system`; `ReuiFacetFilters` from `@/components/filters/reui-facet-filters`.
- Produces: `usersService.queryUsers(condition, page, sort)` returning a `Page<UserRow>`.

`listAll()` is an unpaginated `select * from users` rendered into a raw `<Table>`. It already lists every guest customer alongside staff, and slice 1 multiplied those rows. **Follow the products list end to end as the reference implementation** — server page owns `SPEC: FacetDef[]`, `parseFilterState`, and the service call; the client table renders `DataTable` + `ReuiFacetFilters` + `ListPagination`; a `*TableSkeleton` is exported for `Suspense`.

- [ ] **Step 1: Read the reference implementation**

Read `app/(dashboard)/dashboard/products/page.tsx` and `products/products-table.tsx` in full. Mirror their structure. Do not invent a different pattern.

- [ ] **Step 2: Write the failing test**

Create `apps/puchkaman/lib/services/__tests__/users-query.test.ts`. Assert the facet spec's shape and the default: a role facet exists, offers admin/member/user, and the page defaults to staff so customers are not mixed in. Follow `parse-filter-state.test.ts` in `packages/design-system` for the calling convention, and derive the spec from the page module rather than restating it in the test.

- [ ] **Step 3: Add `queryUsers`**

Add a faceted, paginated query to `users.service.ts` / `users.repository.ts` following how `productsService.queryProducts` is built (`conditionToSql` / `columnResolver` from `@realm/database`). Keep `listAll()` if other callers use it — check with `rg -n 'usersService.listAll' apps/puchkaman` first and report what you find.

**Naming trap:** this repo has a recorded problem with a service method called `list`. Use `queryUsers`, matching `queryProducts`.

- [ ] **Step 4: Build the spec and the table**

Facets: role (pills: admin/member/user), status (pills: active/inactive/suspended/deleted), and a search facet over name and email. Default the role facet to staff (admin + member) so the page opens on staff, with customers reachable by clearing the filter.

Keep every existing behaviour of the current page: `RoleSelect`, `StatusActions`, the self-row special cases, and the deleted-row special cases all still work. Those live in `user-row.tsx` — reuse it, do not rewrite it.

- [ ] **Step 5: Verify the page still guards correctly**

`page.tsx` keeps `requirePermission({ user: ["list"] })`. `member` does not hold `user:list`, so this page stays admin-only — confirm that is still true after your edit.

- [ ] **Step 6: Verify and commit**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`

```bash
git add apps/puchkaman/lib/services apps/puchkaman/app/\(dashboard\)/dashboard/settings/users
git commit -m "feat(puchkaman): paginate and filter the users list"
```

---

### Task 8: "Sync from Clover" on the users list

**Files:**
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/page.tsx`
- Create: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/sync-clover-users-button.tsx`
- Modify: `apps/puchkaman/app/api/employees/sync/clover/route.ts`

**Interfaces:**
- Consumes: the sync from Task 6; `requirePermission`.
- Produces: nothing consumed later.

- [ ] **Step 1: Read the existing precedent**

`components/admin/clover-employees-sync-actions.tsx` is the existing sync button: `apiFetch` to `/api/employees/sync/clover`, a toast reporting counts, `toastSyncErrors`, `router.refresh()`, a `SyncLoadingOverlay`, disabled when Clover is not connected. Reuse this component if it is generic enough; otherwise write a thin sibling that follows it exactly. Say which you chose and why.

- [ ] **Step 2: Add the action to the users page header**

Add the button to the `PageHeader` `actions` slot beside `InviteUserButton`. It must be disabled when Clover is not connected — reuse the same `getCloverConnection` check the Clover pages use, and report what you found.

- [ ] **Step 3: Widen the route guard to the documented permission**

`app/api/employees/sync/clover/route.ts` currently calls `requireAdmin()`. The spec places this action behind `staff:["invite"]`. Change it to `requirePermission({ staff: ["invite"] })`. `member` does not hold `staff:invite`, so this remains admin-only in practice — the change states the actual requirement rather than widening access.

- [ ] **Step 4: Report the counts honestly**

The toast currently reports employees pulled and inactivated. Now that the sync also provisions users, report how many accounts were created and linked too, or state in your report why the result shape could not carry it.

- [ ] **Step 5: Verify**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test && pnpm --filter puchkaman build`
Expected: all PASS.

Confirm `"use client"` is line 1 of the new button component and that it is a named export.

- [ ] **Step 6: Commit**

```bash
git add apps/puchkaman/app
git commit -m "feat(puchkaman): sync clover staff from the users list"
```

---

### Task 9: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Seed a member and confirm the console**

```bash
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
psql "postgres://localhost:5432/puchkaman" -c "
insert into users (public_id, created_at, updated_at, name, email, role, status, password_set)
values ('usr_seedmember01', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint,
        'Seed Member', 'seed-member@example.com', 'member', 'active', false)
on conflict (email) where email is not null do update set role = 'member';"
```

- [ ] **Step 2: Build and start**

Run: `pnpm --filter puchkaman build && pnpm --filter puchkaman start -p 3111`

- [ ] **Step 3: Check the redirect surface without a session**

```bash
for p in /dashboard /dashboard/orders /dashboard/settings /no-access /me; do
  printf "%-28s " "$p"; curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "http://localhost:3111$p"
done
```
Expected: every protected path 307s to `/login` with a `callbackUrl`.

- [ ] **Step 4: Report what still needs a human**

Signing in as the member requires the OTP round trip, which cannot be automated. Report the exact steps for a human: sign in as `seed-member@example.com`, confirm landing on `/dashboard` (not `/no-access`), confirm the sidebar shows Orders / Products / Finance / Account and NOT Settings / Logs / Notifications, confirm `/dashboard/settings` returns a 403 rather than a 500, and confirm `/dashboard/account` opens.

---

## Self-Review

**Spec coverage.** Every Slice 2 requirement maps to a task: the permission table (1, 2), nav filtering (3), re-admitting `member` and reversing the two slice-1 decisions (4), `employees.user_id` (5), sync provisioning with create-only role and no email (6), the users-list facet framework (7), the sync action behind `staff:["invite"]` (8). Deactivation not touching `users.status` is pinned in 6 Step 5.

**Ordering.** Tasks 1-3 must precede 4: re-admitting `member` before the guards and nav are fixed reproduces exactly the 500 that slice 1 removed. Task 5 precedes 6 because the column must exist before it is written. Task 7 precedes 8 only so the button lands on the rebuilt page.

**Placeholders.** Three deliberate read-then-decide steps, each with both branches named: Task 2's `payment-status` route (read vs write, decided by what the handler does), Task 3 Step 5's `AppBottomNav`, and Task 7's reuse of the products reference. Guessing a component API is what produced four wrong imports in slice 1, so these read first.

**Type consistency.** `grantedKeys` returns `string[]`; `NavItem.permission` is a `string`; `getNavSections` takes `granted?: string[]` — all three agree. `resolveEmployeeUser` / `EmployeeUserDeps` match between test and implementation. `queryUsers` mirrors `queryProducts` rather than introducing a new shape, and deliberately avoids the name `list`.

**Known risk.** Task 3 is the one that can break the browser bundle, since `permissions.ts` reaches server-only `@realm/auth`. Step 6 runs a full build specifically to catch that, because `tsc` will not.
