# Perf Optimization Fixes — Bundle, Caching, Query Fan-out & Waterfalls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Land the confirmed perf findings from the review pass — shrink the public/client bundle (Radix/cmdk barrels, react-easy-crop, react-phone-number-input flags), make the global catalog snapshot cacheable so marketing pages prerender, collapse the feature-flags N+1 on the admin users list, and remove the remaining independent-await waterfalls and redundant per-request session lookups. No behavior changes — pure latency/bytes wins.

**Architecture:** Three independent tracks. (1) **Bundle**: opt the Radix/cmdk barrels into Next's `optimizePackageImports`, and `next/dynamic` the heavy client-only widgets (cropper on the account page; phone input on public signup/contact). (2) **Caching**: `loadCatalogSnapshot()` becomes the one cacheable, user-agnostic data source — cross-request cached + tag-busted by catalog admin mutations — which also lets `/menu` and `/pricing` drop `force-dynamic`; `getSession()` gets per-request dedup via `React.cache`. (3) **Query shape**: the admin users list stops calling the per-row `getEffectiveFlags()` helper (computes effective flags in memory from already-fetched data), and a handful of pages/services convert sequential-but-independent awaits to `Promise.all`.

**Tech Stack:** Next.js 16.2.9 (non-stock — read `node_modules/next/dist/docs/` before any framework change), Drizzle, React 19, Vitest.

## Global Constraints

- **Next 16 is vendored/modified.** Before any framework-level change (`optimizePackageImports`, `'use cache'` / `cacheTag` / `cacheComponents`, `revalidate`, `next/dynamic` semantics) **read the relevant page under `node_modules/next/dist/docs/01-app/`** — APIs may differ from stock Next. Heed deprecation notices.
- **No `Co-Authored-By` trailer** in commits — plain messages only.
- **Services stamp `createdBy`/`updatedBy`** via the commons abstract-service layer; do not bypass it. (None of these tasks add writes, but the catalog mutation actions you touch must keep going through the existing services.)
- **Live-DB test harness:** service/query tests hit the real seeded Postgres. Never delete shared fixtures (e.g. `usr_system`); re-seed with `tsx --env-file` if needed. Run query-shape changes against the live harness, not mocks.
- No new runtime deps. Preserve all current behavior and keep tests green (ignore the known `next-id` flake).

## File Structure

- `apps/web/next.config.ts` — `experimental.optimizePackageImports` (Task 1); caching config if the `'use cache'` path is chosen (Task 2).
- `apps/web/lib/catalog/load.ts` — make `loadCatalogSnapshot` cacheable (Task 2).
- `apps/web/app/(marketing)/menu/page.tsx`, `app/(marketing)/pricing/page.tsx` — drop `force-dynamic` (Task 2).
- `apps/web/app/(dashboard)/dashboard/catalog/actions.ts` — bust the catalog cache on mutation (Task 2).
- `apps/web/app/(dashboard)/dashboard/users/page.tsx`, `apps/web/lib/flags.ts` — feature-flags batching (Task 3).
- `apps/web/components/ui/phone-input.tsx` consumers + `app/(dashboard)/dashboard/account/avatar-field.tsx` — dynamic imports (Task 4).
- `apps/web/lib/auth/session.ts` — `React.cache` dedup (Task 5).
- `apps/web/app/(dashboard)/dashboard/page.tsx`, `.../orders/[id]/page.tsx`, `.../inquiries/[id]/page.tsx`, `apps/web/lib/services/customers.service.ts` — parallelize independent awaits (Task 6).

---

### Task 1: Radix/cmdk barrel optimization (`optimizePackageImports`)

**Files:**
- Modify: `apps/web/next.config.ts`

**Findings covered:** `bundle-barrel-imports` (next.config.ts:4-9).

Biggest bytes-for-effort win: the unified `radix-ui` (v1.6.0) meta-package barrel re-exports all ~30 primitives, pulled by 19 `components/ui/*` files, and `cmdk` is similarly a barrel. Next 16's default optimize list includes `lucide-react`/`date-fns` but **not** `radix-ui`/`cmdk`.

- [ ] **Step 1: Read the docs**

Read `node_modules/next/dist/docs/01-app/` for `optimizePackageImports` (config + behavior in this vendored build). Confirm it transforms named imports into direct sub-path imports without source changes.

- [ ] **Step 2: Add the experimental option**

```ts
// before
const nextConfig: NextConfig = {
  transpilePackages: ["@tiffin/commons", "@tiffin/commons-drizzle", "@tiffin/commons-next"],
  turbopack: { root: path.join(import.meta.dirname, "..", "..") },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
};

// after — add:
  experimental: { optimizePackageImports: ["radix-ui", "cmdk"] },
```

Keep all existing `import { ... } from "radix-ui"` named imports unchanged. Do **NOT** add `lucide-react`/`date-fns` — already in Next's default list.

- [ ] **Step 3: Verify + commit**

Run `pnpm --filter web exec tsc --noEmit` → PASS. Run `pnpm --filter web build` and confirm it completes (Turbopack picks up the option without import rewrites). Manual sanity: a page using a Radix primitive (e.g. any dialog) still renders.

```bash
git add apps/web/next.config.ts
git commit -m "perf(bundle): optimizePackageImports for radix-ui + cmdk barrels"
```

---

### Task 2: Cacheable catalog snapshot → prerender `/menu` & `/pricing`

**Files:**
- Modify: `apps/web/lib/catalog/load.ts`
- Modify: `apps/web/app/(marketing)/menu/page.tsx`
- Modify: `apps/web/app/(marketing)/pricing/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/actions.ts`
- Possibly modify: `apps/web/next.config.ts` (only if the `'use cache'` path is taken)

**Findings covered:** `server-cache-lru` (lib/catalog/load.ts:6-32), `next-caching-best-practice` (menu/page.tsx:12, pricing/page.tsx:11).

`loadCatalogSnapshot()` runs SIX parallel SELECTs on every invocation with no memoization, and is hit by many RSC pages plus the subscribe wizard hot path (`reprice`/`validatePostal` fire repeatedly). It is global, user-agnostic, rarely-changing data — so cross-request caching is the fix. The same cache makes `/menu` and `/pricing` (currently `force-dynamic` purely for freshness, because catalog admin actions only `revalidatePath('/dashboard/catalog/*')`) prerenderable and CDN-served, busted on edit by a tag.

All catalog-snapshot data (plans, meal-sizes, delivery-frequencies, duration-packages, delivery-zones) mutates through the single `catalog/actions.ts` `SERVICES` map, so one `revalidateTag('catalog')` per mutation covers everything. (`pricingTiers` is the one snapshot field not in that map — confirm where tiers are edited and add the same tag-bust there, or accept the short TTL window.)

- [ ] **Step 1: Read the docs and pick the approach**

Read `node_modules/next/dist/docs/01-app/` for `'use cache'`, `cacheTag`, `cacheComponents`, and `revalidate`/`revalidateTag` in this vendored 16.2.9 build.

Two paths — **prefer the lower-blast-radius option A** unless the docs confirm `cacheComponents` is safe to enable app-wide (the dashboard relies on per-request `headers()`/session dynamics, so a global default-caching flip is risky):

- **A (recommended, no global config change):** module-level cross-request cache inside `load.ts` + `export const revalidate` on the two marketing pages + `revalidatePath('/menu'|'/pricing')` in the catalog actions.
- **B (more thorough):** mark `loadCatalogSnapshot` with `'use cache'` + `cacheTag('catalog')`, enable `cacheComponents: true` in `next.config.ts`, and `revalidateTag('catalog')` in the actions. Only take B if docs confirm `cacheComponents` won't force-prerender the dynamic dashboard routes.

- [ ] **Step 2 (Path A): Cache the loader + dedup per request**

In `load.ts`, wrap the body in a short-TTL cross-request cache keyed by a constant (it takes no args), and wrap the export in `React.cache` for per-request dedup:

```ts
import { cache as reactCache } from "react";
// ...
let snapshotCache: { at: number; value: CatalogSnapshot } | null = null;
const TTL_MS = 60_000;

async function fetchSnapshot(): Promise<CatalogSnapshot> {
  const [planRows, mealRows, freqRows, durRows, zoneRows, tierRows] = await Promise.all([ /* unchanged 6 queries */ ]);
  return { /* unchanged mapping */ };
}

export const loadCatalogSnapshot = reactCache(async (): Promise<CatalogSnapshot> => {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < TTL_MS) return snapshotCache.value;
  const value = await fetchSnapshot();
  snapshotCache = { at: now, value };
  return value;
});

export function invalidateCatalogSnapshot() { snapshotCache = null; }
```

(If a process-wide module cache is undesirable across the multi-route footprint, use an `LRUCache` with `ttl: 60_000, max: 1` instead — same shape.)

- [ ] **Step 2 (Path B alternative): `'use cache'` + tag**

```ts
import { unstable_cacheTag as cacheTag } from "next/cache"; // confirm exact name in docs
export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  "use cache";
  cacheTag("catalog");
  // ...unchanged body...
}
```
Plus `experimental: { cacheComponents: true }` (or the docs' exact key) in `next.config.ts`.

- [ ] **Step 3: Drop `force-dynamic` from the marketing pages**

In both `menu/page.tsx` and `pricing/page.tsx`, remove:

```ts
// remove
export const dynamic = "force-dynamic";
```

Path A: add `export const revalidate = 600;` to each (10-min ISR safety net on top of the loader cache). Path B: nothing more — the tag handles freshness.

- [ ] **Step 4: Bust the cache on catalog edits**

In `catalog/actions.ts`, in each of `saveItem`/`retireItem`/`reactivateItem`, after the existing `revalidatePath(...)`:

- Path A: call `invalidateCatalogSnapshot()` **and** `revalidatePath("/menu")` + `revalidatePath("/pricing")` so edits surface on the public pages immediately.
- Path B: call `revalidateTag("catalog")`.

```ts
// after, e.g. in saveItem
revalidatePath(`/dashboard/catalog/${resource}`);
invalidateCatalogSnapshot();           // Path A
revalidatePath("/menu");
revalidatePath("/pricing");
// — or — revalidateTag("catalog");     // Path B
```

- [ ] **Step 5: Verify + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. `pnpm --filter web build` → `/menu` and `/pricing` build as static/ISR (not `ƒ` dynamic) in the route summary. Manual: edit a meal size in `/dashboard/catalog/meal-sizes`, confirm `/menu` reflects it (after revalidate). Confirm the subscribe wizard still reprices correctly (loader still returns fresh-enough data within TTL).

```bash
git add apps/web/lib/catalog/load.ts apps/web/app/\(marketing\)/menu/page.tsx apps/web/app/\(marketing\)/pricing/page.tsx apps/web/app/\(dashboard\)/dashboard/catalog/actions.ts apps/web/next.config.ts
git commit -m "perf(catalog): cache global snapshot + tag-bust; prerender /menu and /pricing"
```

---

### Task 3: Kill the feature-flags N+1 on the admin users list

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/users/page.tsx`
- Modify: `apps/web/lib/flags.ts`

**Findings covered:** `async-parallel` (users/page.tsx:30-43), `async-parallel` (lib/flags.ts:6-13).

`UsersPage` calls `getEffectiveFlags(u.publicId)` per row inside `Promise.all`. That helper runs 3 queries each — a redundant user lookup by `publicId` (we already have `u.id`), a redundant `SELECT * FROM featureFlags` (we already fetched `allFlags`), and the per-user overrides query — so ~3N round trips for data that needs **one** batched query. Compute effective flags in memory instead. Separately, fix the independent-await waterfall left in `flags.ts` for the low-traffic `hasFlag` path.

- [ ] **Step 1: Batch overrides once in `users/page.tsx`**

Drop `getEffectiveFlags` here. Fetch all overrides in one query alongside the existing two, then build a `Map<userId, Map<flagId, enabled>>` and compute each user's effective flags from `allFlags` (already in scope), defaulting to `flag.defaultEnabled`:

```ts
import { userFeatureFlags } from "@/db/schema"; // add
// remove: import { getEffectiveFlags } from "@/lib/flags";

const [allUsers, allFlags, allOverrides] = await Promise.all([
  db.select().from(users).orderBy(orderBy),
  db.select().from(featureFlags),
  db.select().from(userFeatureFlags),
]);

// userId -> (flagId -> enabled)
const overridesByUser = new Map<number, Map<number, boolean>>();
for (const o of allOverrides) {
  let m = overridesByUser.get(o.userId);
  if (!m) overridesByUser.set(o.userId, (m = new Map()));
  m.set(o.flagId, Boolean(o.enabled));
}

const rows = allUsers.map((u) => {
  const ov = overridesByUser.get(u.id);
  return {
    user: { id: u.publicId, email: u.email, phone: u.phone, role: u.role },
    flags: allFlags.map((f) => ({
      id: f.publicId, key: f.key, label: f.label,
      enabled: ov?.has(f.id) ? (ov.get(f.id) as boolean) : f.defaultEnabled,
    })),
  };
});
```

This takes the page from `2 + 3N` queries to **3 total**, and the outer `await Promise.all(map(async …))` becomes a plain synchronous `.map`. (Match the exact `userFeatureFlags` column names — `userId`/`flagId`/`enabled` — to the schema.)

- [ ] **Step 2: De-waterfall `getEffectiveFlags` (hasFlag path)**

`getEffectiveFlags` is now only reached via `hasFlag`. The `featureFlags` SELECT is independent of the `userRow` lookup; start it first, then `Promise.all` the remaining two:

```ts
export async function getEffectiveFlags(userPublicId: string): Promise<Record<string, boolean>> {
  const flagsP = db.select().from(featureFlags);
  const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
  if (!userRow) { void flagsP.catch(() => {}); return {}; }
  const [flags, overrides] = await Promise.all([
    flagsP,
    db.select().from(userFeatureFlags).where(eq(userFeatureFlags.userId, userRow.id)),
  ]);
  // ...unchanged override-merge loop...
}
```

(Guard the early-started `flagsP` against an unhandled rejection on the `!userRow` early return.)

- [ ] **Step 3: Verify + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. If a flags/users test exists, run it against the **live-DB harness** (`pnpm --filter web test flags` or the users-page test) and confirm the same effective-flag output as before. Manual: `/dashboard/users` renders identical flag toggles; verify query count dropped (e.g. via DB log / `db` debug).

```bash
git add apps/web/app/\(dashboard\)/dashboard/users/page.tsx apps/web/lib/flags.ts
git commit -m "perf(users): compute effective flags in memory (3 queries, not 3N); de-waterfall hasFlag"
```

---

### Task 4: Lazy-load heavy client-only widgets

**Files:**
- Modify: `apps/web/app/(auth)/signup/signup-form.tsx`
- Modify: `apps/web/app/(marketing)/contact/contact-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/account/avatar-field.tsx`

**Findings covered:** `bundle-dynamic-imports` (phone-input.tsx:5-6 via its consumers), `bundle-dynamic-imports` (account/avatar-field.tsx:5).

`phone-input.tsx` eagerly imports `react-phone-number-input` plus `react-phone-number-input/flags` (~265 country-flag SVG components), and `PhoneInput` is imported eagerly into the **public, first-paint** signup and contact forms — so the full flag bundle ships in their initial client JS. `react-easy-crop` (heavy canvas/gesture widget) is eagerly imported at the top of `avatar-field.tsx` but only rendered inside a crop `Dialog` that opens after a file is chosen. Both are `next/dynamic { ssr: false }` candidates.

- [ ] **Step 1: Read the docs**

Read `node_modules/next/dist/docs/01-app/` for `next/dynamic` (`ssr: false`, `loading`) in this vendored build before wiring it.

- [ ] **Step 2: Dynamic-import `PhoneInput` in the two public consumers**

Leave `components/ui/phone-input.tsx` itself unchanged (keep it a normal named export). At each consumer, swap the eager import for a dynamic one with a plain `Input` skeleton:

```tsx
// signup-form.tsx / contact-form.tsx — remove:
// import { PhoneInput } from "@/components/ui/phone-input";

// add:
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
const PhoneInput = dynamic(
  () => import("@/components/ui/phone-input").then((m) => m.PhoneInput),
  { ssr: false, loading: () => <Input disabled placeholder="Phone" /> },
);
```

JSX usage (`<PhoneInput {...field} defaultCountry="CA" />`, `<PhoneInput {...field} defaultCountry={defaultCountry} />`) stays as-is. Optionally preload on form focus.

- [ ] **Step 3: Dynamic-import the cropper in `avatar-field.tsx`**

```tsx
// remove: import Cropper from "react-easy-crop";  (keep the type import)
import type { Area } from "react-easy-crop";
import dynamic from "next/dynamic";
const Cropper = dynamic(() => import("react-easy-crop"), { ssr: false });
```

`<Cropper … />` inside the `Dialog` is unchanged. Optionally `onMouseEnter`/`onFocus` of the "Change photo" button, fire `import("react-easy-crop")` to warm the chunk.

- [ ] **Step 4: Verify + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. `pnpm --filter web build` → confirm `react-phone-number-input`/flags no longer in the signup/contact route's first-load JS, and `react-easy-crop` split out of the account route's main chunk (check the build's per-route JS sizes). Manual: signup/contact phone field still works (country select, validation); account photo crop dialog still opens and crops.

```bash
git add apps/web/app/\(auth\)/signup/signup-form.tsx apps/web/app/\(marketing\)/contact/contact-form.tsx apps/web/app/\(dashboard\)/dashboard/account/avatar-field.tsx
git commit -m "perf(bundle): lazy-load PhoneInput (public forms) and react-easy-crop (account)"
```

---

### Task 5: Dedup `getSession` per request with `React.cache`

**Files:**
- Modify: `apps/web/lib/auth/session.ts`

**Findings covered:** `server-cache-react` (lib/auth/session.ts:21-44).

`getSession()` runs a session-store lookup + cookie verification and is called at least twice per dashboard render — once in `DashboardLayout` and again via `requireStaff`/`requireAdmin`/`getSession` in the page itself. It takes no arguments, so `React.cache` collapses these into one lookup per request. The `DYNAMIC_SERVER_USAGE` rethrow path is unaffected — `cache()` re-throws on miss.

- [ ] **Step 1: Wrap in `cache`**

```ts
import { cache } from "react";
// ...
export const getSession = cache(async () => {
  // unchanged body
});
```

Keep the `isDynamicServerError` rethrow exactly as-is so Next still marks routes dynamic.

- [ ] **Step 2: Verify + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. Run any auth/session test on the **live-DB harness** if present. Manual: dashboard pages still gate correctly (staff/admin/customer redirects unchanged); a customer hitting `/dashboard` still bounces to `/dashboard/account`.

```bash
git add apps/web/lib/auth/session.ts
git commit -m "perf(auth): React.cache getSession to dedup per-request session lookups"
```

---

### Task 6: Parallelize independent awaits (waterfalls)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/orders/[id]/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/page.tsx`
- Modify: `apps/web/lib/services/customers.service.ts`

**Findings covered:** `async-parallel` (dashboard/page.tsx:38-39), `async-parallel` (orders/[id]/page.tsx:38-39), `server-parallel-fetching` (inquiries/[id]/page.tsx:54-59), `async-parallel` (customers.service.ts:94-125).

Four spots await independent queries sequentially. Each fix is a local `Promise.all`; the inquiries one needs care because the second query is started before a `notFound()`-throwing `read()`.

- [ ] **Step 1: Dashboard overview — stats ∥ recent orders**

```ts
// before
const stats = await loadStats();
const recent = await db.select({ … }).from(orders).orderBy(desc(orders.createdAt)).limit(5);

// after
const [stats, recent] = await Promise.all([
  loadStats(),
  db.select({ deploymentId: orders.deploymentId, status: orders.status, fullName: orders.fullName, city: orders.city, total: orders.total, createdAt: orders.createdAt })
    .from(orders).orderBy(desc(orders.createdAt)).limit(5),
]);
```

- [ ] **Step 2: Order detail — activities ∥ app settings**

`getAppSettings()` is independent of the order; start it early, join with activities (both depend only on the resolved order / nothing):

```ts
const settingsP = getAppSettings();
let order;
try { order = await readOrder(id); }
catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
const [activities, settings] = await Promise.all([listOrderActivities(order.id), settingsP]);
```

(`buildMealsGrid(..., settings)` and everything below is unchanged.)

- [ ] **Step 3: Inquiry detail — read ∥ listActivities**

`listActivities(id)` depends only on the route param, not on `inq`. Start both with `id`; guard the early-started activities promise against an unhandled rejection when `read()` throws `notFound`:

```ts
const inqP = inquiriesService.read(id);
const activitiesP = inquiriesService.listActivities(id);
let inq;
try { inq = await inqP; }
catch (e) { void activitiesP.catch(() => {}); if (e instanceof NotFoundError) notFound(); throw e; }
const activities = await activitiesP;
// the leadSources `source` query still depends on inq.sourceId → stays after, unchanged
```

- [ ] **Step 4: `getCustomer360` — orderRows ∥ inqRows**

Both depend only on the already-resolved `user` and are independent of each other. Fold the conditional `inqRows` into the `Promise.all`:

```ts
const [orderRows, inqRows] = await Promise.all([
  db.select({ … }).from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)),
  matchConds.length
    ? db.select({ … }).from(inquiries).innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id)).where(or(...matchConds)).orderBy(desc(inquiries.createdAt))
    : Promise.resolve([]),
]);
```

(Build `matchConds` before the `Promise.all` exactly as today.)

- [ ] **Step 5: Verify + commit**

`pnpm --filter web exec tsc --noEmit` → PASS. Run the customers service test on the **live-DB harness** (`getCustomer360` returns the same timeline ordering). Manual: dashboard overview, an order detail, and an inquiry detail page all render identically; a non-existent order/inquiry id still 404s (no unhandled-rejection warning in the server log).

```bash
git add apps/web/app/\(dashboard\)/dashboard/page.tsx apps/web/app/\(dashboard\)/dashboard/orders/\[id\]/page.tsx apps/web/app/\(dashboard\)/dashboard/inquiries/\[id\]/page.tsx apps/web/lib/services/customers.service.ts
git commit -m "perf(rsc): parallelize independent awaits (overview, order/inquiry detail, customer360)"
```

---

## Deferred / not worth it

- **`hasFlag` micro-waterfall as a standalone task** — folded into Task 3 Step 2. Once the users-list N+1 (Task 3 Step 1) lands, `getEffectiveFlags` is only reached via the low-traffic `hasFlag`; the one saved round trip there isn't worth its own task/commit, so it rides along with the N+1 fix. (Finding `async-parallel` flags.ts:6-13, downgraded medium→low by the reviewer — covered, not dropped.)
- **Enabling `cacheComponents` app-wide** — explicitly *not* the default recommendation in Task 2. The dashboard depends on per-request `headers()`/session dynamics; flipping global default-caching semantics is higher blast radius than the lightweight `revalidate` + module-cache path. Only adopt if the Next 16 docs confirm it won't force-prerender the dynamic dashboard routes.
- **Rewriting `phone-input.tsx` internals** (e.g. tree-shaking the flags module by country) — out of scope. The `next/dynamic` wrapper at the two public consumers (Task 4) removes it from first paint, which is the whole win; restructuring the shared component for marginal extra savings is not justified.
- **`pricingTiers` mutation tag-bust** — there is no `pricing-tiers` entry in `catalog/actions.ts`'s `SERVICES` map. If tiers are edited elsewhere, add the same `invalidateCatalogSnapshot()`/`revalidateTag('catalog')` there; otherwise the 60s TTL / 600s ISR window is an acceptable staleness bound and not worth a dedicated mechanism.

---

## Execution Handoff

Executes via an **ultracode workflow**: tasks are largely independent (Task 1 bundle config, Task 2 caching, Task 3 flags, Task 4 dynamic imports, Task 5 session, Task 6 waterfalls) and can be parallelized, except Tasks 1 and 2 both touch `next.config.ts` — merge their config edits or run them sequentially to avoid a conflict. Verify gate per task: `tsc --noEmit` always; `pnpm --filter web build` for the bundle/caching tasks (1, 2, 4); the live-DB harness for query-shape tasks (3, 5, 6). Ignore the `next-id` flake. Adversarial review against this plan + the original findings — every change must be byte-for-byte behavior-preserving (latency/bytes only).
