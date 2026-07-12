# RBAC + Security Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn tiffin-grab's single-role auth into dynamic permission-based RBAC, housed in `@realm/auth` so other Realm apps reuse it wholesale.

**Architecture:** `@realm/auth` (server-only) grows to own the identity tables (`users`, `session`, `account`, `verification`) plus RBAC tables (`roles`, `permissions`, `role_permissions`, `user_permissions`), a per-request permission resolver, and permission guards. The existing feature-flag system is renamed into the permission catalog. tiffin-grab keeps a 1:1 `user_profiles` table for app-specific columns.

**Tech Stack:** Next.js 16, Better Auth, Drizzle ORM (PostgreSQL), Vitest, pnpm/Turborepo.

**Spec:** `docs/superpowers/specs/2026-07-12-rbac-security-package-design.md`

## Global Constraints

- Branch: `feat/security-rbac`. Long-lived; integrate `main` regularly, never merge back until the whole plan is done and verified.
- `@realm/auth` stays **server-only — NOT** added to `apps/tiffin-grab/next.config.ts` `transpilePackages`.
- Keep the acyclic package graph: `@realm/auth` may import `@realm/commons` and `@realm/database`; it must NEVER import an app.
- Pricing/audit rules unchanged: audit fields stamped from session, never input.
- Verify gate after every task: `pnpm turbo typecheck && pnpm turbo test`. `tsc` cannot catch a stripped `"use client"` or a client symbol demoted from a named export — eyeball those.
- Public IDs (`usr_`, `rol_`, `perm_`) never leak the internal bigint; keep the `generateId:false` Better Auth contract.
- TDD: write the failing test first for all logic (resolver, guards, lockout). Schema/migration tasks verify via drizzle-kit generate + a live-DB smoke test.

---

## File Structure

**`packages/auth/src/` (new/changed):**
- `schema/roles.ts` — `roles`, `permissions`, `rolePermissions` tables (no user FK)
- `schema/users.ts` — `users` (identity+security core), `roleId → roles`
- `schema/auth-tables.ts` — `session`, `account`, `verification` (Better Auth)
- `schema/user-permissions.ts` — `userPermissions` (userId→users, permissionId→permissions)
- `schema/index.ts` — barrel re-export of all package schema
- `permissions/resolve.ts` — `resolveEffectivePermissions(db, userId)`
- `permissions/guards.ts` — `createPermissionGuards(getSession)` (replaces `guards.ts`)
- `permissions/keys.ts` — the seeded permission-key constants (`PERMISSIONS`)
- `index.ts` — extend exports

**`apps/tiffin-grab/` (changed):**
- `db/schema/user-profiles.ts` — new 1:1 profile table
- `db/schema/index.ts` — re-export `@realm/auth` schema instead of local `auth.ts`; drop `feature-flags.ts`/`user-feature-flags.ts`
- `db/schema/auth.ts` — deleted (moved to package)
- `lib/auth/index.ts` — repoint BA adapter `schema:` to package tables
- `lib/auth/session.ts` — resolve permissions into the session
- `lib/auth/guards.ts` — rebuild `requireAdmin`/`requireStaff` on permissions
- `lib/services/roles.service.ts` — new; role CRUD + assignment + lockout invariants
- `lib/services/feature-flags.service.ts` → `permissions.service.ts` (rename)
- `lib/services/user-feature-flags.service.ts` → `user-permissions.service.ts` (rename)
- `lib/flags.ts` → `lib/permissions.ts` (rename; `getEffectiveFlags` → re-export resolver)
- `components/dashboard/app-sidebar.tsx` — `NavItem.roles` → `NavItem.permission`
- `app/(dashboard)/dashboard/layout.tsx` — pass `permissions` to sidebar
- `app/(dashboard)/dashboard/roles/page.tsx` — new roles admin page
- `db/seed-staff.ts` + `db/seed.sql` — seed roles/permissions/rolePermissions

---

## Task 1: RBAC catalog tables in `@realm/auth`

**Files:**
- Create: `packages/auth/src/schema/roles.ts`
- Create: `packages/auth/src/permissions/keys.ts`
- Modify: `packages/auth/package.json` (add deps)
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Produces: tables `roles`, `permissions`, `rolePermissions`; const `PERMISSIONS`.

- [ ] **Step 1: Add deps to `packages/auth/package.json`**

Add to `dependencies`:
```json
"@realm/database": "workspace:*",
"drizzle-orm": "^0.44.5"
```
(Match the `drizzle-orm` version already in `apps/tiffin-grab/package.json` — run `grep drizzle-orm apps/tiffin-grab/package.json` and copy that exact version.) Then `pnpm install`.

- [ ] **Step 2: Create `packages/auth/src/schema/roles.ts`**

```ts
import { updatableColumns } from "@realm/database";
import { bigint, boolean, pgTable, text, unique } from "drizzle-orm/pg-core";

export const roles = pgTable("roles", {
  ...updatableColumns("rol"),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  // System roles are seeded and cannot be deleted. Protected roles additionally
  // can never lose roles.manage or their last holder (lockout guard).
  isSystem: boolean("is_system").notNull().default(false),
  protected: boolean("protected").notNull().default(false),
});

export const permissions = pgTable("permissions", {
  ...updatableColumns("perm"),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  defaultEnabled: boolean("default_enabled").notNull().default(false),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    ...updatableColumns("rlp"),
    roleId: bigint("role_id", { mode: "bigint" }).notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: bigint("permission_id", { mode: "bigint" }).notNull().references(() => permissions.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [unique("role_permissions_role_perm_uq").on(t.roleId, t.permissionId)],
);
```

- [ ] **Step 3: Create `packages/auth/src/permissions/keys.ts`**

```ts
// Canonical permission keys. nav.* gate side-menu items; the rest gate guards.
// Adding a key here is not enough — it must also be seeded (Task 9).
export const PERMISSIONS = {
  ROLES_MANAGE: "roles.manage",
  NAV_OVERVIEW: "nav.overview",
  NAV_INQUIRIES: "nav.inquiries",
  NAV_ORDERS: "nav.orders",
  NAV_CUSTOMERS: "nav.customers",
  NAV_TICKETS: "nav.tickets",
  NAV_CATALOG: "nav.catalog",
  NAV_MENUS: "nav.menus",
  NAV_WALLET: "nav.wallet",
  NAV_DISCOUNTS: "nav.discounts",
  NAV_NOTIFICATIONS: "nav.notifications",
  NAV_USERS: "nav.users",
  NAV_SETTINGS: "nav.settings",
  NAV_DESIGN: "nav.design",
  NAV_MEALS: "nav.meals",
  NAV_SUPPORT: "nav.support",
  NAV_ACCOUNT: "nav.account",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
```

- [ ] **Step 4: Export from `packages/auth/src/index.ts`**

Append:
```ts
export * as schema from "./schema";
export { PERMISSIONS, type PermissionKey } from "./permissions/keys";
```
(Create `packages/auth/src/schema/index.ts` re-exporting `./roles` for now; Tasks 2–3 add the rest.)

- [ ] **Step 5: Verify it compiles and drizzle sees the tables**

Run: `pnpm --filter @realm/auth typecheck`
Expected: PASS.
Run: `cd apps/tiffin-grab && pnpm drizzle-kit generate --name rbac_catalog` after Step-6 wiring — deferred to Task 2 (index not repointed yet). For now just typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/auth/
git commit -m "feat(auth): RBAC catalog tables (roles, permissions, role_permissions)"
```

---

## Task 2: Move identity tables into `@realm/auth`

**Files:**
- Create: `packages/auth/src/schema/users.ts`, `packages/auth/src/schema/auth-tables.ts`, `packages/auth/src/schema/user-permissions.ts`
- Modify: `packages/auth/src/schema/index.ts`
- Modify: `apps/tiffin-grab/db/schema/index.ts`
- Modify: `apps/tiffin-grab/lib/auth/index.ts` (adapter schema import)
- Delete: `apps/tiffin-grab/db/schema/auth.ts` (after copy), `feature-flags.ts`, `user-feature-flags.ts`

**Interfaces:**
- Consumes: `roles` (Task 1).
- Produces: tables `users`, `session`, `account`, `verification`, `userPermissions`.

- [ ] **Step 1: Create `packages/auth/src/schema/users.ts`** — copy the `users` table from `apps/tiffin-grab/db/schema/auth.ts`, KEEPING only identity/security columns, DROPPING the app-specific ones (they move to `user_profiles` in Task 4). Add `roleId`.

```ts
import { updatableColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { roles } from "./roles";

// `locale` pgEnum lives here (package) because both users-era code and the app's
// user_profiles table reference it; export it from @realm/auth/schema. Copy the
// `userRole` pgEnum from the old auth.ts too — the Task 5 data migration reads it.
export const userRole = pgEnum("user_role", ["admin", "member", "user"]);
export const locale = pgEnum("locale", ["en", "fr"]);

export const users = pgTable(
  "users",
  {
    ...updatableColumns("usr"),
    name: text("name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    image: text("image"),
    phone: text("phone"),
    roleId: bigint("role_id", { mode: "bigint" }).references(() => roles.id),
    pinHash: text("pin_hash"),
    pinAttempts: integer("pin_attempts").notNull().default(0),
    passwordSet: boolean("password_set").notNull().default(true),
    username: text("username").unique(),
    displayUsername: text("display_username"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    bauthCreatedAt: timestamp("bauth_created_at").notNull().defaultNow(),
    bauthUpdatedAt: timestamp("bauth_updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("users_phone_unique").on(t.phone).where(sql`${t.phone} is not null`),
    index("users_created_idx").on(t.createdAt),
  ],
);
```

> The old `users.role` enum COLUMN is dropped in the Task 5 migration after `role_id` is backfilled — no legacy column kept. The `userRole` pgEnum type is copied here only so the Task 5 `UPDATE ... WHERE r.key = u.role::text` migration resolves.

- [ ] **Step 2: Create `packages/auth/src/schema/auth-tables.ts`** — move `session`, `account`, `verification` verbatim from the old `auth.ts` (they reference `users`; import it from `./users`). Copy the `nextIdText` helper too.

- [ ] **Step 3: Create `packages/auth/src/schema/user-permissions.ts`**

```ts
import { updatableColumns } from "@realm/database";
import { bigint, boolean, pgTable, unique } from "drizzle-orm/pg-core";
import { permissions } from "./roles";
import { users } from "./users";

export const userPermissions = pgTable(
  "user_permissions",
  {
    ...updatableColumns("uperm"),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    permissionId: bigint("permission_id", { mode: "bigint" }).notNull().references(() => permissions.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [unique("user_permissions_user_perm_uq").on(t.userId, t.permissionId)],
);
```

- [ ] **Step 4: Update `packages/auth/src/schema/index.ts`**

```ts
export * from "./roles";
export * from "./users";
export * from "./auth-tables";
export * from "./user-permissions";
```

- [ ] **Step 5: Repoint the app schema barrel** — in `apps/tiffin-grab/db/schema/index.ts`, replace `export * from "./auth";`, `export * from "./feature-flags";`, `export * from "./user-feature-flags";` with:
```ts
export { users, session, account, verification, roles, permissions, rolePermissions, userPermissions, userRole, locale } from "@realm/auth/schema";
```
Wait — `@realm/auth` exports schema as a namespace (`export * as schema`). Add a subpath export in `packages/auth/package.json`:
```json
"exports": { ".": "./src/index.ts", "./schema": "./src/schema/index.ts" }
```
Then the app imports `from "@realm/auth/schema"`. Delete `db/schema/auth.ts`, `feature-flags.ts`, `user-feature-flags.ts`.

- [ ] **Step 6: Repoint the Better Auth adapter** — in `apps/tiffin-grab/lib/auth/index.ts`, the import `import { account, session, users, verification } from "@/db/schema";` still resolves (barrel now re-exports from the package). No change needed IF the barrel re-exports these names. Confirm `drizzleAdapter` schema mapping still lists `{ user: users, account, session, verification }`.

- [ ] **Step 7: Regenerate migration + smoke test**

Run: `cd apps/tiffin-grab && pnpm drizzle-kit generate --name move_identity_rbac`
Expected: a migration adding `roles`, `permissions`, `role_permissions`, `user_permissions`, `users.role_id`. Review the SQL — it must NOT drop/recreate `users` (only add `role_id`).
Run: `pnpm turbo typecheck`
Expected: PASS.

- [ ] **Step 8: Verify sign-in end-to-end (HIGHEST RISK GATE)** — apply the migration to a scratch DB, run the app, and manually: sign up, sign out, sign in (email + phone + username), confirm session persists. If any auth path breaks, STOP and fix before continuing.

Run: `pnpm --filter tiffin-grab dev` and exercise `/login`, `/signup`.

- [ ] **Step 9: Commit**

```bash
git add packages/auth/ apps/tiffin-grab/
git commit -m "feat(auth): move users + Better Auth tables into @realm/auth; add role_id"
```

---

## Task 3: Permission resolver (TDD)

**Files:**
- Create: `packages/auth/src/permissions/resolve.ts`
- Test: `packages/auth/src/permissions/__tests__/resolve.test.ts`

**Interfaces:**
- Consumes: `roles`, `permissions`, `rolePermissions`, `userPermissions`, `users`.
- Produces: `resolveEffectivePermissions(db, userId: bigint): Promise<Set<string>>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeEffective } from "../resolve";

describe("computeEffective", () => {
  const catalog = [
    { id: 1n, key: "a", defaultEnabled: false },
    { id: 2n, key: "b", defaultEnabled: true },
    { id: 3n, key: "c", defaultEnabled: false },
  ];
  it("role default overrides catalog default", () => {
    const set = computeEffective(catalog, [{ permissionId: 1n, enabled: true }], []);
    expect(set.has("a")).toBe(true); // role turned on a
    expect(set.has("b")).toBe(true); // catalog default on
  });
  it("user override wins over role default", () => {
    const set = computeEffective(catalog, [{ permissionId: 2n, enabled: true }], [{ permissionId: 2n, enabled: false }]);
    expect(set.has("b")).toBe(false); // user revoked b
  });
  it("user override can grant a catalog-off perm", () => {
    const set = computeEffective(catalog, [], [{ permissionId: 3n, enabled: true }]);
    expect(set.has("c")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @realm/auth test resolve`
Expected: FAIL — `computeEffective` not defined.

- [ ] **Step 3: Implement `packages/auth/src/permissions/resolve.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Database } from "@realm/database";
import { permissions, rolePermissions, userPermissions, users } from "../schema";

type Cat = { id: bigint; key: string; defaultEnabled: boolean };
type Ovr = { permissionId: bigint; enabled: boolean };

// Pure core — unit-tested without a DB. Precedence: user override, else role
// default, else catalog default.
export function computeEffective(catalog: Cat[], roleDefaults: Ovr[], userOverrides: Ovr[]): Set<string> {
  const roleBy = new Map(roleDefaults.map((r) => [r.permissionId, r.enabled]));
  const userBy = new Map(userOverrides.map((u) => [u.permissionId, u.enabled]));
  const out = new Set<string>();
  for (const p of catalog) {
    const on = userBy.has(p.id) ? userBy.get(p.id)! : roleBy.has(p.id) ? roleBy.get(p.id)! : p.defaultEnabled;
    if (on) out.add(p.key);
  }
  return out;
}

export async function resolveEffectivePermissions(db: Database, userId: bigint): Promise<Set<string>> {
  const [catalog, overrides, [user]] = await Promise.all([
    db.select({ id: permissions.id, key: permissions.key, defaultEnabled: permissions.defaultEnabled }).from(permissions),
    db.select({ permissionId: userPermissions.permissionId, enabled: userPermissions.enabled }).from(userPermissions).where(eq(userPermissions.userId, userId)),
    db.select({ roleId: users.roleId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const roleDefaults = user?.roleId
    ? await db.select({ permissionId: rolePermissions.permissionId, enabled: rolePermissions.enabled }).from(rolePermissions).where(eq(rolePermissions.roleId, user.roleId))
    : [];
  return computeEffective(catalog, roleDefaults, overrides);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @realm/auth test resolve`
Expected: PASS.

- [ ] **Step 5: Export + commit**

Add `export { resolveEffectivePermissions, computeEffective } from "./permissions/resolve";` to `packages/auth/src/index.ts`.
```bash
git add packages/auth/
git commit -m "feat(auth): resolveEffectivePermissions with user>role>default precedence"
```

---

## Task 4: `user_profiles` table + column migration

**Files:**
- Create: `apps/tiffin-grab/db/schema/user-profiles.ts`
- Modify: `apps/tiffin-grab/db/schema/index.ts`
- Modify: `apps/tiffin-grab/lib/services/users.service.ts` (read/write profile fields via join)

**Interfaces:**
- Produces: table `userProfiles`.

- [ ] **Step 1: Create `apps/tiffin-grab/db/schema/user-profiles.ts`**

```ts
import { updatableColumns } from "@realm/database";
import { bigint, boolean, pgTable, text } from "drizzle-orm/pg-core";
import { locale, users } from "@realm/auth/schema";

export const userProfiles = pgTable("user_profiles", {
  ...updatableColumns("uprof"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  addressLine: text("address_line"),
  addressUnit: text("address_unit"),
  city: text("city"),
  postalCode: text("postal_code"),
  province: text("province"),
  dietaryNotes: text("dietary_notes"),
  allergens: text("allergens"),
  deliveryNotes: text("delivery_notes"),
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifySms: boolean("notify_sms").notNull().default(false),
  locale: locale("locale").notNull().default("en"),
});
```
> Move the `locale` pgEnum definition INTO `@realm/auth/schema/users.ts` (or a shared enum file in the package) since both the package and app reference it. Export it from `@realm/auth/schema`.

- [ ] **Step 2: Add to app schema barrel** — `export * from "./user-profiles";` in `apps/tiffin-grab/db/schema/index.ts`.

- [ ] **Step 3: Generate migration with data backfill**

Run: `cd apps/tiffin-grab && pnpm drizzle-kit generate --name user_profiles`
Then HAND-EDIT the generated migration to backfill before dropping the old columns:
```sql
INSERT INTO user_profiles (public_id, app_id, user_id, address_line, address_unit, city, postal_code, province, dietary_notes, allergens, delivery_notes, notify_email, notify_sms, locale, created_at, updated_at)
SELECT 'uprof_' || substr(md5(random()::text), 1, 20), app_id, id, address_line, address_unit, city, postal_code, province, dietary_notes, allergens, delivery_notes, notify_email, notify_sms, locale, created_at, updated_at
FROM users;
-- THEN the drizzle-generated ALTER TABLE users DROP COLUMN ... for the moved columns.
```
> Use the app's real `public_id` generator if one exists in SQL (check `db/seed.sql`); otherwise the `makePublicId` default fires on insert — omit `public_id` from the INSERT and let the column default apply.

- [ ] **Step 4: Update `usersService`** — any read returning dietary/address/notify/locale now joins `user_profiles`. Grep callers first: `rg "dietaryNotes|addressLine|notifySms|\.locale" apps/tiffin-grab`. Update each read to `leftJoin(userProfiles, eq(userProfiles.userId, users.id))`.

- [ ] **Step 5: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS. Apply migration to scratch DB, confirm a customer's address/dietary data survives the move (`SELECT` before/after counts match).

- [ ] **Step 6: Commit**

```bash
git add apps/tiffin-grab/
git commit -m "feat(tiffin-grab): split app-specific user columns into user_profiles"
```

---

## Task 5: Seed roles + migrate `users.role` → `roleId`

**Files:**
- Modify: `apps/tiffin-grab/db/seed-staff.ts`, `apps/tiffin-grab/db/seed.sql`
- Create: a data migration in `apps/tiffin-grab/db/migrations`

**Interfaces:**
- Consumes: `roles`, `users.roleId`.

- [ ] **Step 1: Add a seed for the three system roles** (in `seed.sql` or `seed-staff.ts`):
```sql
INSERT INTO roles (key, label, is_system, protected) VALUES
  ('admin',  'Administrator', true, true),
  ('member', 'Staff',         true, false),
  ('user',   'Customer',      true, false)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Data migration mapping the old enum to `role_id`** — hand-write a migration:
```sql
UPDATE users u SET role_id = r.id FROM roles r WHERE r.key = u.role::text AND u.role_id IS NULL;
-- After backfill verified (Step 3 count = 0), drop the old column in the SAME migration:
ALTER TABLE users DROP COLUMN role;
```
Make `role_id` NOT NULL in a follow-up only once every environment is seeded; leave it nullable during the migration window so seeding order can't fail the constraint.

- [ ] **Step 3: Verify**

Run against scratch DB, then `SELECT count(*) FROM users WHERE role_id IS NULL;` → expect 0.
Run: `pnpm turbo typecheck && pnpm turbo test`.

- [ ] **Step 4: Commit**

```bash
git add apps/tiffin-grab/
git commit -m "feat(tiffin-grab): seed system roles and migrate users.role to role_id"
```

---

## Task 6: Permission guards (TDD)

**Files:**
- Create: `packages/auth/src/permissions/guards.ts`
- Test: `packages/auth/src/permissions/__tests__/guards.test.ts`
- Delete: `packages/auth/src/guards.ts` (old role guards)
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `createPermissionGuards(getSession)` → `{ requireSession, requirePermission, requireAny, requireAll }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { AuthError, ForbiddenError } from "@realm/commons";
import { createPermissionGuards } from "../guards";

const withPerms = (perms: string[] | null) => async () => (perms ? { user: { id: "usr_1", permissions: perms } } : null);

describe("createPermissionGuards", () => {
  it("requireSession throws AuthError when unauthenticated", async () => {
    const { requireSession } = createPermissionGuards(withPerms(null));
    await expect(requireSession()).rejects.toBeInstanceOf(AuthError);
  });
  it("requirePermission passes when held", async () => {
    const { requirePermission } = createPermissionGuards(withPerms(["orders.read"]));
    await expect(requirePermission("orders.read")).resolves.toBeUndefined();
  });
  it("requirePermission throws ForbiddenError when missing", async () => {
    const { requirePermission } = createPermissionGuards(withPerms(["x"]));
    await expect(requirePermission("orders.read")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("requireAny passes if one held; requireAll needs all", async () => {
    const g = createPermissionGuards(withPerms(["a"]));
    await expect(g.requireAny("a", "b")).resolves.toBeUndefined();
    await expect(g.requireAll("a", "b")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @realm/auth test guards`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/auth/src/permissions/guards.ts`**

```ts
import { AuthError, ForbiddenError } from "@realm/commons";

type SessionUser = { id: string; permissions: string[] };
type GetSession = () => Promise<{ user?: SessionUser | null } | null | undefined>;

export function createPermissionGuards(getSession: GetSession) {
  async function requireSession(): Promise<SessionUser> {
    const session = await getSession();
    if (!session?.user) throw new AuthError();
    return session.user;
  }
  async function requirePermission(...keys: string[]): Promise<void> {
    const user = await requireSession();
    const set = new Set(user.permissions);
    if (!keys.every((k) => set.has(k))) throw new ForbiddenError();
  }
  async function requireAny(...keys: string[]): Promise<void> {
    const user = await requireSession();
    const set = new Set(user.permissions);
    if (!keys.some((k) => set.has(k))) throw new ForbiddenError();
  }
  const requireAll = requirePermission;
  return { requireSession, requirePermission, requireAny, requireAll };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @realm/auth test guards`
Expected: PASS.

- [ ] **Step 5: Swap exports** — in `packages/auth/src/index.ts`, replace `export { createRoleGuards } from "./guards";` with `export { createPermissionGuards } from "./permissions/guards";`. Delete `packages/auth/src/guards.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/auth/
git commit -m "feat(auth): permission guards (requirePermission/Any/All) replace role guards"
```

---

## Task 7: Wire session + app guards to permissions

**Files:**
- Modify: `apps/tiffin-grab/lib/auth/session.ts`
- Modify: `apps/tiffin-grab/lib/auth/guards.ts`
- Modify: `apps/tiffin-grab/lib/permissions.ts` (renamed from `lib/flags.ts`)

**Interfaces:**
- Consumes: `resolveEffectivePermissions`, `createPermissionGuards`.
- Produces: `getSession()` returns `{ user: { id, permissions: string[], email } }`; `requireAdmin`/`requireStaff` unchanged signatures.

- [ ] **Step 1: Extend `getSession`** — after resolving `u.publicId`, load internal id + resolve permissions:
```ts
import { resolveEffectivePermissions } from "@realm/auth";
// ... inside the cache():
const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, u.publicId)).limit(1);
if (!row) return null;
const permissions = [...(await resolveEffectivePermissions(db, row.id))];
return { user: { id: u.publicId, permissions, email: u.email ?? "" } };
```
Drop `role` from the returned shape (guards use permissions now). If any code still reads `session.user.role`, grep and migrate: `rg "session.user.role|user\.role" apps/tiffin-grab`.

- [ ] **Step 2: Rebuild `lib/auth/guards.ts`**
```ts
import { PERMISSIONS } from "@realm/auth";
import { createPermissionGuards } from "@realm/auth";
import { getSession } from "./session";

const g = createPermissionGuards(getSession);
export const { requireSession, requirePermission, requireAny, requireAll } = g;

// Back-compat wrappers so existing callers stay unchanged. "admin" == holds
// roles.manage; "staff" == holds any operational nav permission.
export const requireAdmin = () => g.requirePermission(PERMISSIONS.ROLES_MANAGE);
export const requireStaff = () => g.requireAny(PERMISSIONS.NAV_ORDERS, PERMISSIONS.NAV_INQUIRIES);
```

- [ ] **Step 3: Rename `lib/flags.ts` → `lib/permissions.ts`** — `getEffectiveFlags` becomes a thin wrapper over `resolveEffectivePermissions` returning `Record<string, boolean>` if any caller needs the map shape (grep `getEffectiveFlags` callers and update imports). Delete the old bespoke resolution.

- [ ] **Step 4: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS. Manually: sign in as admin → reach `/dashboard/users`; as member → blocked from admin routes; as customer → only `/dashboard/account` etc.

- [ ] **Step 5: Commit**

```bash
git add apps/tiffin-grab/
git commit -m "feat(tiffin-grab): resolve permissions into session; guards use permissions"
```

---

## Task 8: Side menu driven by permissions

**Files:**
- Modify: `apps/tiffin-grab/components/dashboard/app-sidebar.tsx`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `session.user.permissions`.
- Produces: `NavItem.permission: string`; sidebar filters by permission set.

- [ ] **Step 1: Change the `NavItem` type + `SECTIONS`** — replace `roles: string[]` with `permission: string`, mapping each item to its `nav.*` key:
```ts
export type NavItem = { title: string; href: string; icon: LucideIcon; permission: string };
// e.g. { title: "Orders", href: "/dashboard/orders", icon: PackageIcon, permission: "nav.orders" }
```
Map every existing item to the matching `PERMISSIONS.NAV_*` value (Overview→nav.overview, … Account→nav.account).

- [ ] **Step 2: Filter by permission** — wherever the sidebar currently filters `items.filter(i => i.roles.includes(role))`, change to `items.filter(i => permissions.has(i.permission))`. The component takes `permissions: string[]` prop (build a `Set` inside). Keep it a serializable `string[]` prop — do NOT pass a `Set` across the server/client boundary.

- [ ] **Step 3: Update the layout** — in `app/(dashboard)/dashboard/layout.tsx`, replace the `role`-based props with `permissions={session.user.permissions}`. Remove the `role === "user"` / `role === "member"` branches or re-express them via permission checks (grep `role ===` in the layout; the rep-coupon `member` branch can key off a `nav.discounts`-style permission or stay if a role concept is still surfaced — prefer a permission check).

- [ ] **Step 4: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS. Confirm `"use client"` still at the top of `app-sidebar.tsx`. Manually diff the rendered menu for admin/member/customer against pre-migration — must be identical (that's what the seed in Task 9 guarantees).

- [ ] **Step 5: Commit**

```bash
git add apps/tiffin-grab/
git commit -m "feat(tiffin-grab): side menu items gated by permissions, not roles"
```

---

## Task 9: Seed nav permissions + role defaults (behavior-preserving)

**Files:**
- Modify: `apps/tiffin-grab/db/seed.sql` (or `seed-staff.ts`)

**Interfaces:**
- Consumes: `permissions`, `rolePermissions`, `roles`.

- [ ] **Step 1: Seed the permission catalog** — one row per `PERMISSIONS.*` key, `default_enabled=false` for admin-only items, `true` for `nav.account`:
```sql
INSERT INTO permissions (key, label, default_enabled) VALUES
  ('roles.manage','Manage roles',false),
  ('nav.overview','Overview',false), ('nav.inquiries','Inquiries',false),
  ('nav.orders','Orders',false), ('nav.customers','Customers',false),
  ('nav.tickets','Tickets',false), ('nav.catalog','Catalog',false),
  ('nav.menus','Weekly Menus',false), ('nav.wallet','Wallet',false),
  ('nav.discounts','Discounts',false), ('nav.notifications','Notifications',false),
  ('nav.users','Users',false), ('nav.settings','Settings',false),
  ('nav.design','Design system',false), ('nav.meals','My meals',false),
  ('nav.support','Support',false), ('nav.account','Account',true)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Seed `role_permissions` reproducing today's `roles: string[]` map** — from `app-sidebar.tsx` SECTIONS (admin sees all admin/operations items; member sees operations; user sees meals/support/account). Example for member:
```sql
INSERT INTO role_permissions (role_id, permission_id, enabled)
SELECT r.id, p.id, true FROM roles r, permissions p
WHERE r.key='member' AND p.key IN ('nav.overview','nav.inquiries','nav.orders','nav.customers','nav.tickets','nav.account')
ON CONFLICT (role_id, permission_id) DO NOTHING;
```
Repeat for `admin` (all `nav.*` + `roles.manage`) and `user` (`nav.meals`,`nav.support`,`nav.account`). Copy the exact per-role item lists from the current `SECTIONS` array.

- [ ] **Step 3: Verify parity** — re-run the app on a freshly seeded DB; the menu for each role must match the pre-migration screenshots exactly. Sign in as each of the three roles and diff.

- [ ] **Step 4: Commit**

```bash
git add apps/tiffin-grab/
git commit -m "feat(tiffin-grab): seed nav permissions + role defaults (behavior-preserving)"
```

---

## Task 10: Roles service + lockout invariants (TDD)

**Files:**
- Create: `apps/tiffin-grab/lib/services/roles.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/roles.service.test.ts`
- Rename: `feature-flags.service.ts` → `permissions.service.ts`, `user-feature-flags.service.ts` → `user-permissions.service.ts`

**Interfaces:**
- Produces: `rolesService.{ create, setRolePermission, assignRole, delete }`; throws on lockout violations.

- [ ] **Step 1: Write the failing test** for the lockout invariants:

```ts
import { describe, it, expect } from "vitest";
import { assertRoleMutable, assertNotLastAdmin } from "../roles.service";

describe("lockout invariants", () => {
  it("rejects deleting a protected role", () => {
    expect(() => assertRoleMutable({ key: "admin", protected: true })).toThrow(/protected/);
  });
  it("allows deleting a non-protected role", () => {
    expect(() => assertRoleMutable({ key: "sales", protected: false })).not.toThrow();
  });
  it("rejects stripping roles.manage from a protected role", () => {
    expect(() => assertRoleMutable({ key: "admin", protected: true }, "roles.manage")).toThrow(/protected/);
  });
  it("rejects removing the last admin holder", () => {
    expect(() => assertNotLastAdmin(1)).toThrow(/last/);
    expect(() => assertNotLastAdmin(2)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter tiffin-grab test roles.service`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement the pure invariants + service**

```ts
import { ForbiddenError } from "@realm/commons";

export function assertRoleMutable(role: { key: string; protected: boolean }, strippingPermission?: string): void {
  if (role.protected && (strippingPermission === undefined || strippingPermission === "roles.manage")) {
    throw new ForbiddenError(`Role "${role.key}" is protected`);
  }
}
export function assertNotLastAdmin(remainingHolders: number): void {
  if (remainingHolders < 2) throw new ForbiddenError("Cannot remove the last admin");
}
```
Then the DB methods (`create`, `assignRole`, `setRolePermission`, `delete`) built on the existing feature-flag service patterns, each calling the guards above and audit-stamping `createdBy` from the session. A protected role's effective permissions ALWAYS include the full catalog — enforce in `resolveEffectivePermissions` (add: if the user's role is `protected`, return every catalog key). Add that branch to `resolve.ts` and a test for it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter tiffin-grab test roles.service` and `pnpm --filter @realm/auth test resolve`
Expected: PASS (including the new protected-superuser test).

- [ ] **Step 5: Rename flag services** — `git mv` the two service files, update every import (`rg "feature-flags.service|user-feature-flags.service"`), rename exported symbols (`featureFlagsService`→`permissionsService`, etc.). Update `app/api/feature-flags/*` route paths to `app/api/permissions/*` (or keep the route path, rename internals — grep frontend callers first).

- [ ] **Step 6: Commit**

```bash
git add apps/tiffin-grab/ packages/auth/
git commit -m "feat(tiffin-grab): roles service with lockout invariants; rename flag services to permissions"
```

---

## Task 11: Roles admin page

**Files:**
- Create: `apps/tiffin-grab/app/(dashboard)/dashboard/roles/page.tsx`
- Create: `apps/tiffin-grab/app/(dashboard)/dashboard/roles/actions.ts`

**Interfaces:**
- Consumes: `rolesService`, `requirePermission(PERMISSIONS.ROLES_MANAGE)`.

- [ ] **Step 1: Server page guarded by `roles.manage`** — list roles + their default permissions; a form to create a role; a matrix (role × permission) toggle; a control to assign a role to a user. Follow the existing `/dashboard/users` and `/dashboard/settings` page patterns (server component + server actions in `actions.ts`). Each action calls `requirePermission(PERMISSIONS.ROLES_MANAGE)` first, then `rolesService`.

- [ ] **Step 2: Add the nav item** — `{ title: "Roles", href: "/dashboard/roles", icon: ShieldIcon, permission: "roles.manage" }` in `SECTIONS` under Administration, and seed a `roles.manage`-gated entry (admin already holds it from Task 9).

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS. Manually: as admin create a role "Sales", grant it `nav.orders`, assign a user to it, confirm that user sees only Orders + Account. Attempt to delete `admin` → blocked. Attempt to strip `roles.manage` from `admin` → blocked.

- [ ] **Step 4: Commit**

```bash
git add apps/tiffin-grab/
git commit -m "feat(tiffin-grab): roles admin page (create role, assign permissions, assign to user)"
```

---

## Task 12: Full verification pass

- [ ] **Step 1:** `pnpm turbo typecheck && pnpm turbo test` — all green.
- [ ] **Step 2:** Fresh scratch DB from migrations + seed. Manual matrix: sign-up, sign-in (email/phone/username), sign-out, session persistence; admin/member/customer nav parity vs pre-migration; admin-only route blocks for member; roles admin CRUD; all four lockout invariants (delete protected, strip roles.manage, remove last admin, protected-superuser sees everything).
- [ ] **Step 3:** Confirm `@realm/auth` is NOT in `transpilePackages`; confirm no package imports an app (`rg "from \"@/|apps/tiffin-grab" packages/auth/src` → empty).
- [ ] **Step 4:** Update `AGENTS.md` / `docs/realm/` with the new `@realm/auth` responsibilities (owns identity + RBAC) and the app→`user_profiles` pattern for future clients.
- [ ] **Step 5: Commit** the docs update.

---

## Deferred (NOT in this plan)

**Teams + team leaders.** A team = a group of users; a leader = a role/permission assignment scoped to that team. Roles/permissions are already the primitives; a future spec adds `teams`, `team_members`, and team-scoped permission resolution. Do not build here.
