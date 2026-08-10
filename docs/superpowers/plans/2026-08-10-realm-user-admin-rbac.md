# Admin User Management + Better Auth RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin invite, re-role, suspend, and remove dashboard users in puchkaman and tiffin-grab, with authorization expressed as Better Auth resource/action permissions instead of a flat role string.

**Architecture:** Mount Better Auth's `admin` plugin in both apps, configured with a `createAccessControl` statement per app. Shared permission primitives live in `@realm/auth`; the shared invite dialog lives in `@realm/crm`. Invited users are created with **no credential account** and set their own password through the existing email-OTP reset. `users.status` stays the only sign-in switch — the plugin's ban fields are added as unused columns solely so the drizzle adapter can resolve the plugin's declared schema.

**Tech Stack:** Next.js 16, Better Auth 1.6.20 (`admin`, `emailOTP` plugins), Drizzle ORM + Postgres, Vitest, React 19, `@realm/ui` / `@realm/design-system` components.

**Spec:** `docs/superpowers/specs/2026-08-10-realm-user-admin-rbac-design.md`

## Global Constraints

- Better Auth is pinned to `^1.6.20` in every package. Do not bump it.
- Import access-control helpers from `better-auth/plugins/access` and
  `better-auth/plugins/admin/access` — never from `better-auth/plugins` — for
  tree-shaking. The `admin` plugin itself is imported from `better-auth/plugins`,
  matching how `emailOTP` is already imported in both apps.
- **`@realm/auth` is NOT in `transpilePackages`** (see `apps/puchkaman/next.config.ts:11`).
  It is server-only. Nothing that imports it may end up in a client bundle. This is why
  no `adminClient()` is added: the client plugin would need the `ac`/`roles` objects,
  dragging `@realm/auth` into the browser build. All permission checks are server-side.
- `advanced.database.generateId: false`; `users.id` is `bigint`, `users.public_id` is the
  `usr_…` string. `getSession()` returns **publicId** as `user.id`. Better Auth
  `auth.api.*` calls speak the bigint. Translate at the boundary, every time.
- Server Actions must **return** errors, never throw them to the client — a thrown error
  arrives as an opaque digest. (Existing actions in these apps throw and rely on a
  client-side try/catch around the action call; keep that pattern where it already
  exists, and use it for new actions too.)
- Never rewrite an applied migration. Generate a new one.
- `rg`/`fd` over `grep`/`find`. Comment only the non-obvious *why*.
- Verify contract after each task: `pnpm turbo typecheck` at minimum; full
  `pnpm turbo typecheck && pnpm turbo test` before the final commit.
- Commit messages: conventional prefix, no `Co-Authored-By` trailer.
- `docs/` is in `.gitignore`; committing anything under it needs `git add -f`.

---

## File Structure

**`@realm/auth` (new shared primitives, server-only)**
- Create `packages/auth/src/access.ts` — shared statement fragment + re-exports.
- Create `packages/auth/src/permission-guards.ts` — `createPermissionGuards`.
- Create `packages/auth/src/permission-guards.test.ts`.
- Modify `packages/auth/src/index.ts` — export both.

**`@realm/crm` (shared UI)**
- Create `packages/crm/src/user-invite-dialog.tsx` — client component.
- Modify `packages/crm/src/index.ts` — export it.

**puchkaman**
- Modify `apps/puchkaman/db/schema/auth.ts` — `deleted` status, role default, 4 plugin columns.
- Create `apps/puchkaman/db/migrations/00NN_*.sql` — generated.
- Create `apps/puchkaman/lib/auth/permissions.ts` — statement, `ac`, `roles`.
- Modify `apps/puchkaman/lib/auth/index.ts` — mount `admin()`, `onPasswordReset`.
- Modify `apps/puchkaman/lib/auth/guards.ts` — `requirePermission`, keep `requireAdmin`.
- Modify `apps/puchkaman/lib/auth/session.ts` — `Role.USER` fallback → `Role.MEMBER`.
- Modify `apps/puchkaman/lib/services/users.service.ts` — `setRole`, `softDelete`, `inviteUser`.
- Create `apps/puchkaman/lib/services/users-invite.ts` — invite orchestration, testable.
- Create `apps/puchkaman/lib/services/__tests__/users-invite.test.ts`.
- Create `apps/puchkaman/lib/auth/__tests__/permissions.test.ts`.
- Modify `apps/puchkaman/app/(dashboard)/dashboard/settings/users/{page.tsx,actions.ts,user-row.tsx}`.
- Create `apps/puchkaman/app/(dashboard)/dashboard/settings/users/invite-user-button.tsx`.

**tiffin-grab**
- Create `apps/tiffin-grab/lib/auth/permissions.ts`.
- Modify `apps/tiffin-grab/lib/auth/index.ts` — mount `admin()`, `onPasswordReset`.
- Modify `apps/tiffin-grab/lib/auth/guards.ts`.
- Modify `apps/tiffin-grab/app/(dashboard)/dashboard/users/{page.tsx,actions.ts}`.

---

### Task 1: Shared access-control primitives in `@realm/auth`

**Files:**
- Create: `packages/auth/src/access.ts`
- Create: `packages/auth/src/permission-guards.ts`
- Test: `packages/auth/src/permission-guards.test.ts`
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Consumes: `AuthError`, `ForbiddenError`, `RoleValue` from `@realm/commons` (see `packages/commons/src/errors.ts:10-18`, `packages/commons/src/enums.ts:1`).
- Produces:
  - `crmStatements`, `baseStatement`, and re-exports `createAccessControl`, `adminAc`, `defaultStatements` from `@realm/auth`.
  - `createPermissionGuards(getSession, roles) => { requireSession, requirePermission, roleCan }`
    - `roles: Record<string, Role>` where `Role` is better-auth's `Role` type from `better-auth/plugins/access`.
    - `requirePermission(permissions: Record<string, string[]>): Promise<void>` — throws `AuthError` when unauthenticated, `ForbiddenError` when denied.
    - `roleCan(role: string, permissions: Record<string, string[]>): boolean` — synchronous, no session needed.

- [ ] **Step 1: Write the failing test**

Create `packages/auth/src/permission-guards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAccessControl } from "better-auth/plugins/access";
import { AuthError, ForbiddenError } from "@realm/commons";
import { createPermissionGuards } from "./permission-guards";

const ac = createAccessControl({
  order: ["read", "refund"],
  user: ["create", "list"],
} as const);

const roles = {
  admin: ac.newRole({ order: ["read", "refund"], user: ["create", "list"] }),
  member: ac.newRole({ order: ["read"] }),
};

const sessionFor = (role: string | null) => async () =>
  role ? { user: { role } } : null;

describe("createPermissionGuards", () => {
  it("allows a role that holds the permission", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("admin"), roles);
    await expect(requirePermission({ user: ["create"] })).resolves.toBeUndefined();
  });

  it("denies a role that lacks the action", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("member"), roles);
    await expect(requirePermission({ order: ["refund"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies a role that lacks the resource entirely", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("member"), roles);
    await expect(requirePermission({ user: ["list"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies a role that is not in the map at all", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("ghost"), roles);
    await expect(requirePermission({ order: ["read"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws AuthError, not ForbiddenError, when there is no session", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor(null), roles);
    await expect(requirePermission({ order: ["read"] })).rejects.toBeInstanceOf(AuthError);
  });

  it("requires every action listed for a resource", async () => {
    const { roleCan } = createPermissionGuards(sessionFor("member"), roles);
    expect(roleCan("member", { order: ["read"] })).toBe(true);
    expect(roleCan("member", { order: ["read", "refund"] })).toBe(false);
  });

  it("requires every resource listed", async () => {
    const { roleCan } = createPermissionGuards(sessionFor("admin"), roles);
    expect(roleCan("admin", { order: ["read"], user: ["create"] })).toBe(true);
    expect(roleCan("member", { order: ["read"], user: ["create"] })).toBe(false);
  });
});
```

The last two cases pin behaviour we depend on but do not control: better-auth's
`Role.authorize` defaults to AND across both actions and resources. If a future version
changes that, this test fails loudly instead of silently widening access.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @realm/auth test`
Expected: FAIL — `Failed to resolve import "./permission-guards"`.

- [ ] **Step 3: Write `access.ts`**

Create `packages/auth/src/access.ts`:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

// Resources every Realm CRM has. App-specific resources (product, order, …) are
// added by each app's own permissions.ts, which spreads this in.
export const crmStatements = {
  settings: ["read", "write"],
  audit: ["read"],
} as const;

// defaultStatements carries better-auth's own `user` and `session` resources, which
// the admin plugin's endpoints check against. Dropping them would leave createUser
// and setRole permanently forbidden.
export const baseStatement = { ...defaultStatements, ...crmStatements } as const;

export { createAccessControl, adminAc, defaultStatements };
export type { Role } from "better-auth/plugins/access";
```

- [ ] **Step 4: Write `permission-guards.ts`**

Create `packages/auth/src/permission-guards.ts`:

```ts
import { AuthError, ForbiddenError } from "@realm/commons";
import type { Role } from "better-auth/plugins/access";

type SessionUser = { role: string };
type GetSession = () => Promise<{ user?: SessionUser | null } | null | undefined>;
type Permissions = Record<string, string[]>;

/**
 * Permission guards for any client. Authorization runs LOCALLY against the role map:
 * the acting user's role is already on the session, so `auth.api.userHasPermission`
 * would add a request per check for an answer we can compute here.
 *
 * An unknown role denies. That matters more than it looks — a role present in the DB
 * but absent from the map (a stale value, a half-finished migration) must fail closed.
 */
export function createPermissionGuards(getSession: GetSession, roles: Record<string, Role>) {
  async function requireSession(): Promise<SessionUser> {
    const session = await getSession();
    if (!session?.user) throw new AuthError();
    return session.user;
  }

  function roleCan(role: string, permissions: Permissions): boolean {
    const r = roles[role];
    if (!r) return false;
    return r.authorize(permissions).success;
  }

  async function requirePermission(permissions: Permissions): Promise<void> {
    const user = await requireSession();
    if (!roleCan(user.role, permissions)) throw new ForbiddenError();
  }

  return { requireSession, requirePermission, roleCan };
}
```

- [ ] **Step 5: Export from the package index**

Modify `packages/auth/src/index.ts` — add to the existing exports:

```ts
export { createPermissionGuards } from "./permission-guards";
export { crmStatements, baseStatement, createAccessControl, adminAc, defaultStatements } from "./access";
export type { Role } from "./access";
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @realm/auth test && pnpm --filter @realm/auth typecheck`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/auth/src/access.ts packages/auth/src/permission-guards.ts \
        packages/auth/src/permission-guards.test.ts packages/auth/src/index.ts
git commit -m "feat(auth): add shared access-control statements and permission guards"
```

---

### Task 2: puchkaman schema — status parity, role default, plugin columns

**Files:**
- Modify: `apps/puchkaman/db/schema/auth.ts:17` (status enum), `:27` (role default), and the `users`/`session` column lists
- Create: `apps/puchkaman/db/migrations/00NN_<generated>.sql` (drizzle-kit picks the name; the last applied is `0009_big_juggernaut.sql`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `users.status` accepts `"deleted"`; `users.role` defaults to `'member'`; `users.banned` / `users.banReason` / `users.banExpires` and `session.impersonatedBy` exist and are nullable.

**Why the unused columns:** the admin plugin declares them on its models
(`better-auth/dist/plugins/admin/schema.mjs`). The drizzle adapter resolves plugin
fields against the schema object passed to `drizzleAdapter`, so a declared field with no
column risks a resolution failure on the sign-in read path. Four nullable columns is
cheaper than fighting it. Nothing ever writes them.

- [ ] **Step 1: Edit the enum and role default**

Modify `apps/puchkaman/db/schema/auth.ts`. Replace the `userStatus` enum (line 17) and
its comment:

```ts
// Account lifecycle. Only "active" may obtain a session — enforced in
// lib/auth/index.ts's session.create.before hook and re-checked on the read path.
// "deleted" is a soft delete: the row and its business references survive, the
// contact details are tombstoned. Matches tiffin-grab.
export const userStatus = pgEnum("user_status", ["active", "inactive", "suspended", "deleted"]);
```

Replace the `userRole` comment and the `role` column default:

```ts
// Staff only. Orders never provision an account here — guest checkout plus the
// order-tracking plugin covers customers deliberately — so "user" is retained in the
// enum for compatibility but is never assigned. The default is "member" so a row that
// somehow arrives without an explicit role still lands on a role the permission map
// knows; "user" would fail every check silently.
export const userRole = pgEnum("user_role", ["admin", "member", "user"]);
```

```ts
    role: userRole("role").notNull().default("member"),
```

- [ ] **Step 2: Add the four unused plugin columns**

In the same file, in the `users` table after `passwordSet`:

```ts
    // Declared by the better-auth admin plugin and never written by this app —
    // users.status is the only sign-in switch (see the session.create.before hook).
    // Present so the drizzle adapter can resolve every field the plugin declares.
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires"),
```

In the `session` table, after `userAgent`:

```ts
    // Declared by the admin plugin's schema; impersonation is not enabled here.
    impersonatedBy: text("impersonated_by"),
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter puchkaman db:generate`
Expected: a new file under `apps/puchkaman/db/migrations/`. Open it and confirm it
contains an `ALTER TYPE "public"."user_status" ADD VALUE 'deleted'`, an
`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member'`, and four
`ADD COLUMN` statements. Do not hand-edit any previously applied migration.

- [ ] **Step 4: Apply it locally and verify**

Run: `pnpm --filter puchkaman db:migrate`
Then verify the enum took:

```bash
psql "$DATABASE_URL" -c "select unnest(enum_range(null::user_status));"
```
Expected: four rows, including `deleted`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter puchkaman typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/puchkaman/db/schema/auth.ts apps/puchkaman/db/migrations
git commit -m "feat(puchkaman): add deleted status, member role default, admin-plugin columns"
```

---

### Task 3: puchkaman permission map and `admin` plugin wiring

**Files:**
- Create: `apps/puchkaman/lib/auth/permissions.ts`
- Test: `apps/puchkaman/lib/auth/__tests__/permissions.test.ts`
- Modify: `apps/puchkaman/lib/auth/index.ts` (plugins array; `Role.USER` at line 62)
- Modify: `apps/puchkaman/lib/auth/guards.ts`
- Modify: `apps/puchkaman/lib/auth/session.ts:28`

**Interfaces:**
- Consumes: `baseStatement`, `adminAc`, `createAccessControl`, `createPermissionGuards` from `@realm/auth` (Task 1).
- Produces:
  - `ac`, `roles`, `statement`, `INVITABLE_ROLES` from `apps/puchkaman/lib/auth/permissions.ts`.
  - `requirePermission`, `requireAdmin`, `roleCan` from `apps/puchkaman/lib/auth/guards.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/auth/__tests__/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roles, INVITABLE_ROLES } from "../permissions";

describe("puchkaman permission map", () => {
  it("is staff-only — there is no customer role", () => {
    expect(Object.keys(roles).sort()).toEqual(["admin", "member"]);
    expect(INVITABLE_ROLES).toEqual(["admin", "member"]);
  });

  it("lets admin create users and set roles", () => {
    expect(roles.admin.authorize({ user: ["create", "set-role"] }).success).toBe(true);
    expect(roles.admin.authorize({ staff: ["invite", "suspend", "remove"] }).success).toBe(true);
  });

  it("denies admin the plugin endpoints this app deliberately does not mount", () => {
    // ban / impersonate / delete authorize /admin/ban-user, /admin/impersonate-user
    // and /admin/remove-user, which better-auth mounts unconditionally. If a future
    // edit spreads adminAc.statements back in, these turn red — which is the point.
    for (const action of ["ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "update"]) {
      expect(roles.admin.authorize({ user: [action] }).success).toBe(false);
    }
  });

  it("does not let member manage users", () => {
    expect(roles.member.authorize({ user: ["create"] }).success).toBe(false);
    expect(roles.member.authorize({ user: ["list"] }).success).toBe(false);
  });

  it("lets member work orders but not refund them", () => {
    expect(roles.member.authorize({ order: ["read", "write"] }).success).toBe(true);
    expect(roles.member.authorize({ order: ["refund"] }).success).toBe(false);
  });

  it("does not let member change settings", () => {
    expect(roles.member.authorize({ settings: ["write"] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter puchkaman test -- permissions`
Expected: FAIL — cannot resolve `../permissions`.

- [ ] **Step 3: Write the permission map**

Create `apps/puchkaman/lib/auth/permissions.ts`:

```ts
import { baseStatement, createAccessControl } from "@realm/auth";
import { Role } from "@realm/commons";

// Resource/action vocabulary for this app. `baseStatement` brings better-auth's own
// `user` and `session` resources (which the admin plugin's endpoints check) plus the
// shared CRM `settings` and `audit`.
export const statement = {
  ...baseStatement,
  // This app's own user-management actions. Deliberately NOT better-auth's `user`
  // resource: `user: ["ban"]` and `user: ["delete"]` are what authorize the plugin's
  // /admin/ban-user and /admin/remove-user endpoints, so gating our soft-delete on
  // them would hand out the hard delete alongside it.
  staff: ["invite", "suspend", "remove"],
  product: ["read", "write", "sync"],
  order: ["read", "write", "refund", "cancel"],
  finance: ["read"],
  clover: ["read", "connect"],
} as const;

export const ac = createAccessControl(statement);

// Staff only: puchkaman never provisions a customer account, so Role.USER has no
// entry here and roleCan() denies it by construction.
export const roles = {
  admin: ac.newRole({
    // An explicit subset of adminAc.statements, NOT a spread of it. The admin plugin
    // mounts ban-user, unban-user, impersonate-user and remove-user unconditionally —
    // there is no config flag that omits them — and each authorizes against this map.
    // Spreading adminAc would make all four reachable over raw HTTP by any admin
    // session, which defeats two invariants this design rests on: users.status is the
    // only sign-in switch (better-auth's own sign-in check reads `banned`, a flag no
    // UI here shows or clears), and softDelete is the only delete (orders and payments
    // reference these rows).
    //
    // Granted: create + set-role (createUser needs both), list and get (read-only),
    // and the session endpoints. Omitted: ban, impersonate, impersonate-admins,
    // delete, set-password, set-email, update — none of which this app calls.
    user: ["create", "list", "get", "set-role"],
    session: ["list", "revoke", "delete"],
    staff: ["invite", "suspend", "remove"],
    settings: ["read", "write"],
    audit: ["read"],
    product: ["read", "write", "sync"],
    order: ["read", "write", "refund", "cancel"],
    finance: ["read"],
    clover: ["read", "connect"],
  }),
  member: ac.newRole({
    product: ["read"],
    order: ["read", "write"],
    finance: ["read"],
  }),
};

// Roles an admin may hand out from the invite dialog.
export const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER] as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test -- permissions`
Expected: PASS, 5 tests.

- [ ] **Step 5: Rewrite the guards on top of permissions**

Replace `apps/puchkaman/lib/auth/guards.ts` entirely:

```ts
import { Role } from "@realm/commons";
import { createPermissionGuards, createRoleGuards } from "@realm/auth";
import { getSession } from "./session";
import { roles } from "./permissions";

const { requireRole } = createRoleGuards(getSession);
const { requirePermission, roleCan } = createPermissionGuards(getSession, roles);

export { requirePermission, roleCan };

// Kept as-is for the ~30 existing call sites. New code should state the permission
// it needs instead, so adding a role later is a change to permissions.ts alone.
export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}
```

- [ ] **Step 6: Mount the admin plugin**

Modify `apps/puchkaman/lib/auth/index.ts`.

Add imports:

```ts
import { admin as adminPlugin } from "better-auth/plugins";
import { ac, roles } from "./permissions";
```

Change the `role` additional field default (line 62) from `Role.USER` to `Role.MEMBER`:

```ts
      role: { type: "string", required: false, defaultValue: Role.MEMBER, input: false },
```

Add to the `plugins` array, before `nextCookies()`:

```ts
    // Admin user management. Only createUser / setUserPassword / userHasPermission /
    // the session endpoints are called from this app.
    //
    // Deliberately unused:
    //   banUser / unbanUser — users.status is the single "cannot sign in" switch
    //     (see session.create.before below). A second flag would drift out of sync.
    //   removeUser        — hard delete; orders and payments reference these rows.
    //                       usersService.softDelete is the supported path.
    //   impersonateUser   — needs its own audit story before it is safe in a CRM
    //                       holding customer PII.
    // No adminClient() on the browser side: it would need `ac`/`roles`, which live in
    // @realm/auth — a server-only package that is not in transpilePackages.
    adminPlugin({ ac, roles, defaultRole: Role.MEMBER, adminRoles: [Role.ADMIN] }),
```

- [ ] **Step 7: Fix the session role fallback**

Modify `apps/puchkaman/lib/auth/session.ts:28` — `Role.USER` → `Role.MEMBER`:

```ts
  return { user: { id: u.publicId, role: u.role ?? Role.MEMBER, email: u.email ?? "" } };
```

`role` is `NOT NULL` in the schema, so this is a type-level fallback only — but pointing
it at a role absent from the permission map would turn any future null into a silent
denial rather than a working session.

- [ ] **Step 8: Verify nothing regressed**

Run: `pnpm --filter puchkaman typecheck && pnpm --filter puchkaman test`
Expected: PASS. The existing 187 tests must still pass; the admin plugin adds endpoints
but changes no existing behaviour.

- [ ] **Step 9: Commit**

```bash
git add apps/puchkaman/lib/auth
git commit -m "feat(puchkaman): mount better-auth admin plugin with resource permissions"
```

---

### Task 4: puchkaman `setRole` and `softDelete`

**Files:**
- Modify: `apps/puchkaman/lib/services/users.service.ts`
- Test: `apps/puchkaman/lib/services/__tests__/users-service.test.ts` (create)

**Interfaces:**
- Consumes: `usersRepository`, `SessionUpdatableService`, `currentUserId` (all existing in `apps/puchkaman/lib/services/`).
- Produces, on the exported `usersService` singleton:
  - `USER_STATUSES` widened to include `"deleted"`.
  - `tombstoneEmail(publicId: string): string` — exported standalone function.
  - `setRole(publicId: string, role: RoleValue): Promise<UserRow>`
  - `softDelete(publicId: string): Promise<UserRow>`

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/services/__tests__/users-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tombstoneEmail } from "../users.service";

describe("tombstoneEmail", () => {
  it("uses the reserved .invalid TLD so nothing can ever route mail to it", () => {
    expect(tombstoneEmail("usr_abc123")).toBe("deleted-usr_abc123@deleted.invalid");
  });

  it("is unique per user, so two deletions cannot collide on the unique index", () => {
    expect(tombstoneEmail("usr_a")).not.toBe(tombstoneEmail("usr_b"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter puchkaman test -- users-service`
Expected: FAIL — `tombstoneEmail` is not exported.

- [ ] **Step 3: Implement**

Modify `apps/puchkaman/lib/services/users.service.ts`.

Widen the status list (the array currently at the top of the file):

```ts
export const USER_STATUSES = ["active", "inactive", "suspended", "deleted"] as const;
```

Add the tombstone helper above the class:

```ts
/**
 * The address a soft-deleted account's email is replaced with. Tombstoned rather than
 * nulled: the column is unique and the real address has to become reusable, while the
 * row itself must survive because orders and payments reference it. `.invalid` is
 * reserved by RFC 2606, so no MTA can ever deliver to it.
 */
export function tombstoneEmail(publicId: string): string {
  return `deleted-${publicId}@deleted.invalid`;
}
```

Add imports at the top: `import { Role, type RoleValue, ValidationError } from "@realm/commons";`
(`ValidationError` is already imported — extend the existing import rather than adding a
second one.)

Add these two methods to `UsersService`, after `setStatus`:

```ts
  /**
   * Change a user's role. Refuses on your own row for the same reason setStatus does:
   * demoting the only admin locks the whole app out, and there is no recovery path
   * from the UI.
   */
  async setRole(publicId: string, role: RoleValue): Promise<UserRow> {
    if (role !== Role.ADMIN && role !== Role.MEMBER) {
      throw new ValidationError("Unknown role");
    }
    const actorId = await currentUserId();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    if (!target) throw new ValidationError("User not found");
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot change your own role.");
    }
    return super.update(publicId, { role });
  }

  /**
   * Soft delete: mark deleted, tombstone the email so the real address frees up, and
   * revoke every session. Business rows are never hard-deleted, which is also why the
   * admin plugin's removeUser endpoint is not exposed.
   */
  async softDelete(publicId: string): Promise<UserRow> {
    const actorId = await currentUserId();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    if (!target) throw new ValidationError("User not found");
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot remove your own account.");
    }
    const row = await super.update(publicId, {
      status: "deleted",
      email: tombstoneEmail(publicId),
    });
    await db.delete(sessionTable).where(eq(sessionTable.userId, target.id));
    return row;
  }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter puchkaman test -- users-service && pnpm --filter puchkaman typecheck`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/lib/services/users.service.ts apps/puchkaman/lib/services/__tests__/users-service.test.ts
git commit -m "feat(puchkaman): add setRole and soft-delete to the users service"
```

---

### Task 5: puchkaman invite orchestration + `onPasswordReset`

**Files:**
- Create: `apps/puchkaman/lib/services/users-invite.ts`
- Test: `apps/puchkaman/lib/services/__tests__/users-invite.test.ts`
- Modify: `apps/puchkaman/lib/auth/index.ts` (add `emailAndPassword.onPasswordReset`)

**Interfaces:**
- Consumes: `usersService` (Task 4), `auth` from `@/lib/auth`, `emailSchema` / `ValidationError` from `@realm/commons`, `INVITABLE_ROLES` (Task 3).
- Produces: `inviteUser(input: { email: string; name: string; role: RoleValue }, deps?: InviteDeps): Promise<{ publicId: string; email: string }>` from `apps/puchkaman/lib/services/users-invite.ts`, plus the exported `InviteDeps` type.

**Why a `deps` parameter:** puchkaman's vitest config runs pure unit tests with no
database (`apps/puchkaman/vitest.config.ts` only sets `DATABASE_URL` so `db/client.ts`
can be imported). Injecting the three collaborators keeps the ordering and error
mapping testable without a live Postgres or a live SES.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/services/__tests__/users-invite.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Role } from "@realm/commons";
import { inviteUser, type InviteDeps } from "../users-invite";

function deps(overrides: Partial<InviteDeps> = {}): InviteDeps {
  return {
    createUser: vi.fn(async () => ({ publicId: "usr_new", email: "ada@example.com" })),
    markPasswordUnset: vi.fn(async () => {}),
    sendResetOtp: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("inviteUser", () => {
  it("creates the user, clears passwordSet, then mails the OTP — in that order", async () => {
    const calls: string[] = [];
    const d = deps({
      createUser: vi.fn(async () => { calls.push("create"); return { publicId: "usr_new", email: "ada@example.com" }; }),
      markPasswordUnset: vi.fn(async () => { calls.push("mark"); }),
      sendResetOtp: vi.fn(async () => { calls.push("send"); }),
    });

    const result = await inviteUser({ email: "Ada@Example.com ", name: "Ada", role: Role.MEMBER }, d);

    expect(calls).toEqual(["create", "mark", "send"]);
    expect(result).toEqual({ publicId: "usr_new", email: "ada@example.com" });
  });

  it("normalizes the email to lowercase and trims it before creating", async () => {
    const d = deps();
    await inviteUser({ email: "  Ada@Example.com ", name: "Ada", role: Role.MEMBER }, d);
    expect(d.createUser).toHaveBeenCalledWith({ email: "ada@example.com", name: "Ada", role: Role.MEMBER });
  });

  it("never sends a password to createUser", async () => {
    const d = deps();
    await inviteUser({ email: "ada@example.com", name: "Ada", role: Role.MEMBER }, d);
    const arg = (d.createUser as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).not.toHaveProperty("password");
  });

  it("rejects an invalid email before touching anything", async () => {
    const d = deps();
    await expect(inviteUser({ email: "nope", name: "Ada", role: Role.MEMBER }, d)).rejects.toThrow(
      "Enter a valid email",
    );
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("rejects a blank name", async () => {
    const d = deps();
    await expect(inviteUser({ email: "ada@example.com", name: "  ", role: Role.MEMBER }, d)).rejects.toThrow(
      "Name is required",
    );
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("rejects a role that is not invitable", async () => {
    const d = deps();
    await expect(
      inviteUser({ email: "ada@example.com", name: "Ada", role: Role.USER }, d),
    ).rejects.toThrow("Unknown role");
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("maps the plugin's duplicate-email error to a readable message", async () => {
    const d = deps({
      createUser: vi.fn(async () => {
        throw new Error("User already exists. Use another email.");
      }),
    });
    await expect(
      inviteUser({ email: "ada@example.com", name: "Ada", role: Role.MEMBER }, d),
    ).rejects.toThrow("That email is already in use");
  });

  it("keeps the created account when the OTP mail fails, and says so", async () => {
    const d = deps({
      sendResetOtp: vi.fn(async () => {
        throw new Error("SES is down");
      }),
    });
    await expect(
      inviteUser({ email: "ada@example.com", name: "Ada", role: Role.MEMBER }, d),
    ).rejects.toThrow("Account created, but the invite email could not be sent");
    expect(d.markPasswordUnset).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter puchkaman test -- users-invite`
Expected: FAIL — cannot resolve `../users-invite`.

- [ ] **Step 3: Implement**

Create `apps/puchkaman/lib/services/users-invite.ts`:

```ts
import { emailSchema, Role, ValidationError, type RoleValue } from "@realm/commons";
import { auth } from "@/lib/auth";
import { usersService } from "./users.service";

export type InviteDeps = {
  createUser: (input: { email: string; name: string; role: RoleValue }) => Promise<{ publicId: string; email: string }>;
  markPasswordUnset: (publicId: string) => Promise<void>;
  sendResetOtp: (email: string) => Promise<void>;
};

// The real collaborators. Split out so the orchestration above can be unit-tested
// without a database or SES; the app always uses these.
const liveDeps: InviteDeps = {
  createUser: async ({ email, name, role }) => {
    // No `password` field on purpose. The admin plugin treats it as optional and, when
    // absent, creates the user with NO credential account at all — so there is no
    // password to generate, hash, or leak. /email-otp/reset-password creates the
    // credential when the invitee sets one.
    const res = await auth.api.createUser({ body: { email, name, role } });
    const created = res.user as { id: string; publicId?: string; email: string };
    if (!created.publicId) throw new Error("createUser returned no publicId");
    return { publicId: created.publicId, email: created.email };
  },
  markPasswordUnset: async (publicId) => {
    // passwordSet is not a better-auth field, so no plugin endpoint can write it.
    // False routes the invitee through /set-password if they reach the dashboard
    // before choosing a password.
    await usersService.update(publicId, { passwordSet: false });
  },
  sendResetOtp: async (email) => {
    await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
  },
};

/**
 * Create a staff account and mail its owner a code to set their own password.
 *
 * No password is ever issued, displayed, or transmitted: the account exists with no
 * credential until the invitee completes the OTP reset, which also flips emailVerified.
 */
export async function inviteUser(
  input: { email: string; name: string; role: RoleValue },
  deps: InviteDeps = liveDeps,
): Promise<{ publicId: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw new ValidationError("Enter a valid email");

  const name = input.name.trim();
  if (name === "") throw new ValidationError("Name is required");
  if (name.length > 120) throw new ValidationError("Name is too long");

  if (input.role !== Role.ADMIN && input.role !== Role.MEMBER) {
    throw new ValidationError("Unknown role");
  }

  let created: { publicId: string; email: string };
  try {
    created = await deps.createUser({ email: parsed.data, name, role: input.role });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/already exists/i.test(msg)) throw new ValidationError("That email is already in use");
    throw e;
  }

  await deps.markPasswordUnset(created.publicId);

  try {
    await deps.sendResetOtp(created.email);
  } catch {
    // The account is real and usable — an admin can retry from the row's "Send
    // password reset" action. Rolling it back would silently discard their work over
    // a transient mail failure.
    throw new ValidationError(
      "Account created, but the invite email could not be sent. Use Send password reset on their row to retry.",
    );
  }

  return created;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test -- users-invite`
Expected: PASS, 8 tests.

- [ ] **Step 5: Flip `passwordSet` when a reset completes**

Modify `apps/puchkaman/lib/auth/index.ts` — add to the `emailAndPassword` block, after
`revokeSessionsOnPasswordReset: true`:

```ts
    // An invited account starts with passwordSet=false and no credential. Completing
    // the OTP reset IS choosing a password, so clear the flag here — otherwise the
    // dashboard layout keeps bouncing them to /set-password forever. onPasswordReset
    // is better-auth's own hook for this; no ctx.path matching required.
    onPasswordReset: async ({ user }) => {
      try {
        await db.update(users).set({ passwordSet: true }).where(eq(users.id, BigInt(user.id)));
      } catch (e) {
        log.error({ err: e }, "passwordSet flip after reset failed");
      }
    },
```

`db`, `users`, `eq`, and `log` are all already imported in that file.

- [ ] **Step 6: Verify**

Run: `pnpm --filter puchkaman typecheck && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/lib/services/users-invite.ts \
        apps/puchkaman/lib/services/__tests__/users-invite.test.ts \
        apps/puchkaman/lib/auth/index.ts
git commit -m "feat(puchkaman): invite staff accounts with no issued password"
```

---

### Task 6: Shared invite dialog in `@realm/crm`

**Files:**
- Create: `packages/crm/src/user-invite-dialog.tsx`
- Modify: `packages/crm/src/index.ts`

**Interfaces:**
- Consumes: `@realm/ui` primitives — `Button` (`@realm/ui/button`), `Dialog` family (`@realm/ui/dialog`), `Input` (`@realm/ui/input`), `Label` (`@realm/ui/label`), `Select` family (`@realm/ui/select`), and `toast` from `sonner` (already a `@realm/crm` dependency).
- Produces:
  ```ts
  export type InviteRoleOption = { value: string; label: string };
  export type InviteUserInput = { email: string; name: string; role: string };
  export type UserInviteDialogProps = {
    roles: InviteRoleOption[];
    onInvite: (input: InviteUserInput) => Promise<void>;
    triggerLabel?: string;
  };
  export function UserInviteDialog(props: UserInviteDialogProps): JSX.Element;
  ```

**Layering:** `crm-core` never imports an app. `roles` and `onInvite` arrive as props —
the server action is passed down from the app, so this file imports nothing app-specific
and nothing from `@realm/auth`.

- [ ] **Step 1: Write the component**

Create `packages/crm/src/user-invite-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@realm/ui/dialog";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";

export type InviteRoleOption = { value: string; label: string };
export type InviteUserInput = { email: string; name: string; role: string };

export type UserInviteDialogProps = {
  roles: InviteRoleOption[];
  onInvite: (input: InviteUserInput) => Promise<void>;
  triggerLabel?: string;
};

/**
 * Invite a staff account. No password field by design — the invitee receives a code
 * and sets their own, so nothing is ever shared out of band.
 */
export function UserInviteDialog({ roles, onInvite, triggerLabel = "Invite user" }: UserInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(roles[0]?.value ?? "");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      try {
        await onInvite({ email, name, role });
        toast.success(`Invite sent to ${email.trim()}.`);
        setOpen(false);
        setEmail("");
        setName("");
        setRole(roles[0]?.value ?? "");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not send the invite.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            They receive a code by email and choose their own password. No password is set here.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || email.trim() === "" || name.trim() === ""}>
            {pending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Export it**

Modify `packages/crm/src/index.ts` — add:

```ts
export {
  UserInviteDialog,
  type InviteRoleOption,
  type InviteUserInput,
  type UserInviteDialogProps,
} from "./user-invite-dialog";
```

- [ ] **Step 3: Verify the two things `tsc` cannot catch**

Confirm by eye, per AGENTS.md:
1. `"use client"` is the first line of `user-invite-dialog.tsx`.
2. `UserInviteDialog` is a **named** export in both the component file and `index.ts`.

Then confirm `@realm/crm` is already in puchkaman's `transpilePackages`
(`apps/puchkaman/next.config.ts:11` — it is) and in tiffin-grab's:

Run: `rg -n "transpilePackages" apps/tiffin-grab/next.config.ts`
Expected: the array includes `@realm/crm`. If it does not, add it — a client component
from an untranspiled package fails at build, not typecheck.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @realm/crm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/user-invite-dialog.tsx packages/crm/src/index.ts
git commit -m "feat(crm): add shared user invite dialog"
```

---

### Task 7: puchkaman users page — invite, role, remove, reset

**Files:**
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/page.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/actions.ts`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/user-row.tsx`
- Create: `apps/puchkaman/app/(dashboard)/dashboard/settings/users/invite-user-button.tsx`

**Interfaces:**
- Consumes: `inviteUser` (Task 5), `usersService.setRole` / `.softDelete` / `.setStatus` (Task 4), `requirePermission` (Task 3), `UserInviteDialog` + `INVITABLE_ROLES` (Tasks 6, 3).
- Produces: server actions `setUserStatus`, `setUserRole`, `removeUser`, `sendPasswordReset`, `inviteUserAction`.

- [ ] **Step 1: Extend the server actions**

Replace `apps/puchkaman/app/(dashboard)/dashboard/settings/users/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ValidationError, type RoleValue } from "@realm/commons";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/guards";
import { inviteUser } from "@/lib/services/users-invite";
import { usersService, type UserStatusValue } from "@/lib/services/users.service";

const PATH = "/dashboard/settings/users";

export async function setUserStatus(publicId: string, status: UserStatusValue): Promise<void> {
  // staff:suspend, NOT user:ban — the latter also authorizes the plugin's
  // /admin/ban-user endpoint, which this app deliberately does not mount.
  await requirePermission({ staff: ["suspend"] });
  // The self-suspension guard lives in the service, not here, so it holds for
  // every caller rather than just this button.
  await usersService.setStatus(publicId, status);
  revalidatePath(PATH);
}

export async function setUserRole(publicId: string, role: RoleValue): Promise<void> {
  await requirePermission({ user: ["set-role"] });
  await usersService.setRole(publicId, role);
  revalidatePath(PATH);
}

export async function removeUser(publicId: string): Promise<void> {
  // staff:remove, NOT user:delete — user:delete authorizes /admin/remove-user, a hard
  // delete that would orphan the orders and payments referencing this row.
  await requirePermission({ staff: ["remove"] });
  // Soft delete — never the plugin's removeUser, which is a hard delete and would
  // orphan the orders and payments that reference this row.
  await usersService.softDelete(publicId);
  revalidatePath(PATH);
}

export async function sendPasswordReset(email: string): Promise<void> {
  // staff:invite covers onboarding and recovery alike. user:set-password would also
  // authorize /admin/set-user-password — an admin issuing a password directly, which
  // is the exact out-of-band handoff this whole design avoids.
  await requirePermission({ staff: ["invite"] });
  if (!email || email.endsWith("@deleted.invalid")) {
    throw new ValidationError("This account has no reachable email address.");
  }
  // The admin never sees or issues a password: this mails the same 6-digit code the
  // user would get from Forgot password, and their existing one stays valid until
  // they complete the reset.
  await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
}

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<void> {
  await requirePermission({ staff: ["invite"], user: ["create", "set-role"] });
  await inviteUser({ email: input.email, name: input.name, role: input.role as RoleValue });
  revalidatePath(PATH);
}
```

- [ ] **Step 2: Add the invite button wrapper**

Create `apps/puchkaman/app/(dashboard)/dashboard/settings/users/invite-user-button.tsx`:

```tsx
"use client";

import { UserInviteDialog } from "@realm/crm";
import { inviteUserAction } from "./actions";

// Thin client wrapper: the shared dialog takes the action as a prop so @realm/crm
// stays free of app imports.
export function InviteUserButton({ roles }: { roles: { value: string; label: string }[] }) {
  return <UserInviteDialog roles={roles} onInvite={inviteUserAction} />;
}
```

- [ ] **Step 3: Extend the row actions**

Replace `apps/puchkaman/app/(dashboard)/dashboard/settings/users/user-row.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Role, type RoleValue } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { removeUser, sendPasswordReset, setUserRole, setUserStatus } from "./actions";
import type { UserStatusValue } from "@/lib/services/users.service";

export function RoleSelect({
  publicId,
  role,
  status,
  isSelf,
}: {
  publicId: string;
  role: RoleValue;
  status: UserStatusValue;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();

  // Demoting yourself is how the last admin locks everyone out; the service refuses
  // it too, but a disabled control explains why before the click.
  if (isSelf) return <span className="text-muted-foreground text-xs uppercase">{role}</span>;
  // A removed account is a tombstone. Re-roling one would succeed silently — setRole
  // has no status guard — and mean nothing, since it can never hold a session again.
  if (status === "deleted") return <span className="text-muted-foreground text-xs uppercase">{role}</span>;

  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(next) =>
        start(async () => {
          try {
            await setUserRole(publicId, next as RoleValue);
            toast.success("Role updated.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not change the role.");
          }
        })
      }
    >
      <SelectTrigger className="h-8 w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={Role.ADMIN}>Admin</SelectItem>
        <SelectItem value={Role.MEMBER}>Member</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function StatusActions({
  publicId,
  email,
  status,
  isSelf,
}: {
  publicId: string;
  email: string | null;
  status: UserStatusValue;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();

  if (isSelf) return <span className="text-muted-foreground text-xs">You</span>;
  if (status === "deleted") return <span className="text-muted-foreground text-xs">Removed</span>;

  const next: UserStatusValue = status === "active" ? "suspended" : "active";
  const label = status === "active" ? "Suspend" : "Reactivate";

  const run = (fn: () => Promise<void>, ok: string, fail: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : fail);
      }
    });

  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || !email}
        onClick={() =>
          run(
            () => sendPasswordReset(email as string),
            "Password reset code sent.",
            "Could not send the reset code.",
          )
        }
      >
        Send reset
      </Button>
      <Button
        variant={status === "active" ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => setUserStatus(publicId, next),
            next === "active" ? "Account reactivated." : "Account suspended and signed out.",
            "Could not change the account status.",
          )
        }
      >
        {label}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={pending}
        onClick={() =>
          run(() => removeUser(publicId), "Account removed and signed out.", "Could not remove the account.")
        }
      >
        Remove
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Wire the page**

Modify `apps/puchkaman/app/(dashboard)/dashboard/settings/users/page.tsx`.

Change the imports to add the invite button, the role select, and the invitable roles:

```tsx
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guards";
import { InviteUserButton } from "./invite-user-button";
import { RoleSelect, StatusActions } from "./user-row";
```

Replace `await requireAdmin();` with the permission check, and drop the now-unused
`requireAdmin` import:

```tsx
  await requirePermission({ user: ["list"] });
```

Give the header its invite action:

```tsx
      <PageHeader
        icon={UsersIcon}
        title="Users"
        subtitle="Accounts that can sign in to this dashboard. Clover Register staff are managed separately under Employees."
        actions={
          <InviteUserButton
            roles={INVITABLE_ROLES.map((r) => ({ value: r, label: r === "admin" ? "Admin" : "Member" }))}
          />
        }
      />
```

Replace the role cell and the actions cell in the table body:

```tsx
                <TableCell>
                  <RoleSelect
                    publicId={r.publicId}
                    role={r.role}
                    status={r.status}
                    isSelf={r.publicId === selfPublicId}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : "outline"}>
                    {r.status === "active"
                      ? "Active"
                      : r.status === "suspended"
                        ? "Suspended"
                        : r.status === "deleted"
                          ? "Removed"
                          : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <StatusActions
                    publicId={r.publicId}
                    email={r.email}
                    status={r.status}
                    isSelf={r.publicId === selfPublicId}
                  />
                </TableCell>
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter puchkaman typecheck && pnpm --filter puchkaman test`
Expected: PASS.

Then run the app and exercise it: `pnpm --filter puchkaman dev`, sign in as an admin,
open `/dashboard/settings/users`, and confirm — invite a test address, the row appears
with role `member` and status `active`; the OTP mail arrives (or the SES error surfaces
as a toast, not a crash); Suspend, Reactivate, role change, and Remove each work and each
refuse on your own row.

- [ ] **Step 6: Commit**

```bash
git add "apps/puchkaman/app/(dashboard)/dashboard/settings/users"
git commit -m "feat(puchkaman): invite, re-role, and remove users from settings"
```

---

### Task 8: tiffin-grab — permissions and the invite dialog

**Files:**
- Create: `apps/tiffin-grab/lib/auth/permissions.ts`
- Modify: `apps/tiffin-grab/lib/auth/index.ts`
- Modify: `apps/tiffin-grab/lib/auth/guards.ts`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/users/actions.ts`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/users/page.tsx`
- Create: `apps/tiffin-grab/app/(dashboard)/dashboard/users/invite-user-button.tsx`
- Create: `apps/tiffin-grab/lib/services/users-invite.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 5, and 6.
- Produces: `ac`, `roles`, `statement`, `INVITABLE_ROLES` from `apps/tiffin-grab/lib/auth/permissions.ts`; `inviteUser` from `apps/tiffin-grab/lib/services/users-invite.ts`; `inviteUserAction` from the users actions module.

**Scope reminder:** tiffin-grab's users list, sort, feature flags, and per-user detail
page are **not** touched. This task adds the missing create path and puts the existing
guards on the permission layer.

- [ ] **Step 1: Write the permission map**

Create `apps/tiffin-grab/lib/auth/permissions.ts`:

```ts
import { baseStatement, createAccessControl } from "@realm/auth";
import { Role } from "@realm/commons";

export const statement = {
  ...baseStatement,
  // This app's own user-management actions — see the same comment in puchkaman's
  // permissions.ts. Gating them on better-auth's `user` resource would also authorize
  // the plugin's ban/impersonate/remove endpoints, which are mounted unconditionally.
  staff: ["invite", "suspend", "remove"],
  order: ["read", "write", "cancel"],
  subscription: ["read", "write", "pause"],
  menu: ["read", "write", "publish"],
  finance: ["read"],
} as const;

export const ac = createAccessControl(statement);

// Unlike puchkaman, `user` exists here — checkout provisions customer accounts. It
// holds no dashboard permissions; it is the role a customer carries.
export const roles = {
  admin: ac.newRole({
    // An explicit subset, NOT a spread of adminAc.statements. See puchkaman's
    // permissions.ts for why: ban / impersonate / delete authorize plugin endpoints
    // this app does not mount, and granting them would bypass users.status and
    // usersService.softDelete over raw HTTP.
    user: ["create", "list", "get", "set-role"],
    session: ["list", "revoke", "delete"],
    staff: ["invite", "suspend", "remove"],
    settings: ["read", "write"],
    audit: ["read"],
    order: ["read", "write", "cancel"],
    subscription: ["read", "write", "pause"],
    menu: ["read", "write", "publish"],
    finance: ["read"],
  }),
  member: ac.newRole({
    order: ["read", "write"],
    subscription: ["read", "write", "pause"],
    menu: ["read"],
    finance: ["read"],
  }),
  user: ac.newRole({}),
};

// Staff only. A customer account is created by checkout, never by an admin typing an
// email, so Role.USER is not offered even though the role exists.
export const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER] as const;
```

- [ ] **Step 2: Rewrite the guards**

Replace `apps/tiffin-grab/lib/auth/guards.ts`:

```ts
import { Role } from "@realm/commons";
import { createPermissionGuards, createRoleGuards } from "@realm/auth";
import { getSession } from "./session";
import { roles } from "./permissions";

const { requireRole } = createRoleGuards(getSession);
const { requirePermission, roleCan } = createPermissionGuards(getSession, roles);

export { requireRole, requirePermission, roleCan };

// App-specific role groupings: what "admin"/"staff" mean for this client. Kept for the
// existing call sites; new code should state the permission it needs.
export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}

export function requireStaff(): Promise<void> {
  return requireRole(Role.ADMIN, Role.MEMBER);
}
```

- [ ] **Step 3: Mount the plugin and the reset hook**

Modify `apps/tiffin-grab/lib/auth/index.ts`.

Add imports:

```ts
import { admin as adminPlugin } from "better-auth/plugins";
import { ac, roles } from "./permissions";
```

Add to `plugins`, before `nextCookies()`:

```ts
    // Admin user management — createUser and setUserPassword only. ban/unban,
    // removeUser and impersonation stay unmounted: users.status is the single sign-in
    // switch, softDelete is the only delete, and impersonation needs its own audit
    // story. No adminClient(): it would pull @realm/auth (server-only, not in
    // transpilePackages) into the browser bundle.
    adminPlugin({ ac, roles, defaultRole: Role.USER, adminRoles: [Role.ADMIN] }),
```

Add to `emailAndPassword`, after `revokeSessionsOnPasswordReset: true`:

```ts
    // An invited staff account starts with passwordSet=false and no credential;
    // completing the OTP reset is them choosing a password. Without this they are
    // bounced to /set-password forever.
    onPasswordReset: async ({ user }) => {
      try {
        await db.update(users).set({ passwordSet: true }).where(eq(users.id, BigInt(user.id)));
      } catch (e) {
        log.error({ err: e }, "passwordSet flip after reset failed");
      }
    },
```

**Note on the plugin columns:** tiffin-grab needs the same four columns Task 2 added to
puchkaman. Check first:

Run: `rg -n "banned|banReason|banExpires|impersonatedBy" apps/tiffin-grab/db/schema/auth.ts`

If they are absent, add them to `apps/tiffin-grab/db/schema/auth.ts` exactly as in Task 2
Step 2, then `pnpm --filter tiffin-grab db:generate` and `db:migrate`. tiffin-grab's
`user_status` enum already has `deleted`, so no enum change is needed there.

- [ ] **Step 4: Add the invite service**

Copy the file verbatim — the two are byte-identical, differing only in how `@/` resolves.
It is not shared because each app's `auth` and `usersService` are distinct singletons and
the package would have to take both as injected dependencies to hold them.

```bash
cp apps/puchkaman/lib/services/users-invite.ts apps/tiffin-grab/lib/services/users-invite.ts
```

One tiffin-grab-specific detail to confirm while writing it: `passwordSet` defaults to
`true` in tiffin-grab (`apps/tiffin-grab/db/schema/auth.ts:43`), so the
`markPasswordUnset` step is what makes the invite correct there rather than a no-op.

- [ ] **Step 5: Add the invite action**

Modify `apps/tiffin-grab/app/(dashboard)/dashboard/users/actions.ts` — add:

```ts
import { inviteUser } from "@/lib/services/users-invite";
import { requirePermission } from "@/lib/auth/guards";

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<void> {
  await requirePermission({ staff: ["invite"], user: ["create", "set-role"] });
  await inviteUser({ email: input.email, name: input.name, role: input.role as RoleValue });
  revalidatePath("/dashboard/users");
}
```

`RoleValue` and `revalidatePath` are already imported in that file.

- [ ] **Step 6: Add the button and wire the header**

Create `apps/tiffin-grab/app/(dashboard)/dashboard/users/invite-user-button.tsx`:

```tsx
"use client";

import { UserInviteDialog } from "@realm/crm";
import { inviteUserAction } from "./actions";

export function InviteUserButton({ roles }: { roles: { value: string; label: string }[] }) {
  return <UserInviteDialog roles={roles} onInvite={inviteUserAction} />;
}
```

Modify `apps/tiffin-grab/app/(dashboard)/dashboard/users/page.tsx` — add the imports:

```tsx
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { InviteUserButton } from "./invite-user-button";
```

and give the header its action:

```tsx
      <PageHeader
        icon={UsersIcon}
        title="Users"
        actions={
          <InviteUserButton
            roles={INVITABLE_ROLES.map((r) => ({ value: r, label: r === "admin" ? "Admin" : "Member" }))}
          />
        }
      />
```

If `apps/tiffin-grab/components/ds`'s `PageHeader` has no `actions` prop, render
`<InviteUserButton …/>` directly above the `SectionCard` instead — do not change the
shared component's API for this.

- [ ] **Step 7: Verify**

Run: `pnpm --filter tiffin-grab typecheck && pnpm --filter tiffin-grab test`
Expected: PASS. Note that `apps/tiffin-grab` has pre-existing checkout test failures
unrelated to auth; compare the failure list against `git stash`-ed baseline if anything
looks new, and do not fix unrelated ones here.

- [ ] **Step 8: Commit**

```bash
git add apps/tiffin-grab/lib/auth apps/tiffin-grab/lib/services/users-invite.ts \
        "apps/tiffin-grab/app/(dashboard)/dashboard/users" apps/tiffin-grab/db
git commit -m "feat(tiffin-grab): add staff invites and permission-backed guards"
```

---

### Task 9: Full verification and documentation

**Files:**
- Modify: `AGENTS.md` (Learned Workspace Facts)

- [ ] **Step 1: Run the full workspace gate**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: every package typechecks; test failures limited to the pre-existing
tiffin-grab checkout suite noted in Task 8.

- [ ] **Step 2: Review the two `tsc`-blind traps across the whole diff**

Run: `git diff main --stat` and, for every `.tsx` file added or modified:

```bash
rg -n '^"use client"' packages/crm/src/user-invite-dialog.tsx \
  "apps/puchkaman/app/(dashboard)/dashboard/settings/users/invite-user-button.tsx" \
  "apps/puchkaman/app/(dashboard)/dashboard/settings/users/user-row.tsx" \
  "apps/tiffin-grab/app/(dashboard)/dashboard/users/invite-user-button.tsx"
```
Expected: a match on line 1 of each. Then confirm every component is still a **named**
export (no default exports introduced, no `Component.Skeleton` demoted).

- [ ] **Step 3: Record the workspace facts**

Add to the "Learned Workspace Facts" section of `AGENTS.md`:

```markdown
- Admin user management runs on the Better Auth `admin` plugin in both apps, configured
  with a per-app `createAccessControl` statement (`apps/*/lib/auth/permissions.ts`).
  Shared primitives live in `@realm/auth` (`baseStatement`, `createPermissionGuards`);
  the invite dialog lives in `@realm/crm`. `requireAdmin`/`requireStaff` still exist for
  old call sites; new code uses `requirePermission({ resource: ["action"] })`.
  Deliberately unmounted: ban/unban (users.status is the only sign-in switch),
  `removeUser` (hard delete — use `usersService.softDelete`), impersonation, and
  `adminClient()` (it would pull server-only `@realm/auth` into the browser bundle).
  Invites create the account with NO credential and mail an OTP; `onPasswordReset`
  flips `passwordSet`. puchkaman is staff-only: `admin` and `member`, no `user` role,
  and the `users.role` column defaults to `member`.
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record the admin user management and RBAC layout"
```

- [ ] **Step 5: Report readiness**

Do not merge to `main`. Report that the branch is ready, list what was verified, and name
anything left out.

---

## Post-implementation notes

Deferred deliberately, each cheap to add later on top of this layer:

- **New named roles** (kitchen, support). Now a change to one `permissions.ts` plus a
  `SelectItem`. Deciding what each may do is a product question.
- **Impersonation.** Needs `session.impersonatedBy` (already migrated in Task 2), an
  audit event, and a visible banner while impersonating.
- **`user_status` = `inactive`** has no UI control in either app; only `active`,
  `suspended`, and now `deleted` are reachable. That was already true before this change.
