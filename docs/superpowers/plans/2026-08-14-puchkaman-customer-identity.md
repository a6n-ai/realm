# Puchkaman Customer Identity & Order History — Implementation Plan (Slice 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let puchkaman customers (`role: "user"`) sign in with an email OTP and see their past and current orders at `/me`.

**Architecture:** Customer `users` rows already exist — checkout creates one per order via `upsertCustomer`. The blocker is `assertSessionAllowed`, which rejects `role === "user"` before a session row is written. This slice lifts that rejection, corrects three role-defaulting defects that would otherwise let a self-service sign-in mint a staff account, adds a `(customer)` route group behind `<CrmShell>`, and reuses the existing order-tracking loader for order detail rather than writing a second one.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` not `middleware.ts`), Better Auth (drizzle adapter, `emailOTP` + `admin` + `order-tracking` plugins), Drizzle ORM on Postgres, Vitest, `@realm/crm` / `@realm/ui` / `@realm/auth-ui`.

**Spec:** `docs/superpowers/specs/2026-08-14-puchkaman-customer-accounts-design.md`

## Global Constraints

- Work in the worktree `/Users/lawbringr/IdeaProjects/realm-wt-3c88e511` on branch `wt/3c88e511`. Never in the shared checkout.
- `docs/` is gitignored (`.gitignore:63`); doc commits need `git add -f`.
- Verify contract after each task: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`.
- Two things `tsc` cannot catch, to check by eye on every client component: a stripped `"use client"` directive, and a client symbol demoted from a named export.
- Never rewrite an applied migration. New SQL goes in a new numbered file; the next number is `0017`.
- Migrations are generated with `pnpm --filter puchkaman db:generate`, applied with `db:migrate`.
- Comment only the non-obvious *why*. No trailing summary comments.
- `session.user.id` from `lib/auth/session.ts` is the **`publicId`** (`usr_…`), not the bigint `users.id`. Inside the Better Auth plugin layer, `session.user.id` is the **bigint** id stringified. Do not mix them.

---

### Task 1: Make session admission a pure, tested decision and let customers in

**Files:**
- Modify: `apps/puchkaman/lib/auth/index.ts:22-45`
- Create: `apps/puchkaman/lib/auth/__tests__/session-admission.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `decideSessionAdmission(row: { role: string; status: string } | undefined): { ok: true } | { ok: false; message: string }`, exported from `apps/puchkaman/lib/auth/index.ts`. Task 2 does not use it; no later task depends on it.

The current rule rejects `role === "user"` outright. That rejection is the single reason every customer record in the database is unreachable. Splitting the decision out of the DB call mirrors `decideTrackingAccess` in `packages/order-tracking/src/access.ts` and makes it testable without standing up an auth instance or a database.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/auth/__tests__/session-admission.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideSessionAdmission } from "../index";

describe("decideSessionAdmission", () => {
  it("admits an active customer — checkout provisions these rows and they own orders", () => {
    expect(decideSessionAdmission({ role: "user", status: "active" })).toEqual({ ok: true });
  });

  it("admits active staff", () => {
    expect(decideSessionAdmission({ role: "admin", status: "active" })).toEqual({ ok: true });
    expect(decideSessionAdmission({ role: "member", status: "active" })).toEqual({ ok: true });
  });

  it.each(["inactive", "suspended", "deleted"])(
    "refuses a customer whose status is %s",
    (status) => {
      const result = decideSessionAdmission({ role: "user", status });
      expect(result.ok).toBe(false);
    },
  );

  it.each(["inactive", "suspended", "deleted"])("refuses staff whose status is %s", (status) => {
    expect(decideSessionAdmission({ role: "admin", status }).ok).toBe(false);
  });

  it("admits when the row is missing so a lookup miss cannot lock everyone out", () => {
    expect(decideSessionAdmission(undefined)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/session-admission.test.ts`
Expected: FAIL — `decideSessionAdmission` is not exported from `../index`.

- [ ] **Step 3: Write minimal implementation**

In `apps/puchkaman/lib/auth/index.ts`, replace the whole `assertSessionAllowed` block (the docblock at lines 22-31 and the function at 32-45) with:

```ts
/**
 * Pure sign-in admission rule, split from the DB read so it is testable without
 * an auth instance. `status` is the only "cannot sign in" switch — role decides
 * where a session may go, never whether one may exist. Customers (`role: "user"`)
 * are provisioned by checkout and sign in by OTP; the dashboard layout is what
 * keeps them out of staff surfaces.
 */
export function decideSessionAdmission(
  row: { role: string; status: string } | undefined,
): { ok: true } | { ok: false; message: string } {
  // A missing row means the lookup raced a delete, not that access is denied;
  // better-auth has already verified the credential by this point.
  if (!row) return { ok: true };
  if (row.status !== "active") {
    return { ok: false, message: "This account is not active. Contact an administrator." };
  }
  return { ok: true };
}

/**
 * Sign-in gate. Runs after the credential check but before a session row is
 * written, so it covers every sign-in method at once rather than each route
 * separately. Exported for tests.
 */
export async function assertSessionAllowed(userId: bigint): Promise<void> {
  const [u] = await db
    .select({ status: users.status, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const decision = decideSessionAdmission(u);
  if (!decision.ok) throw new APIError("FORBIDDEN", { message: decision.message });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/session-admission.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Update the two stale comments that claim customers cannot sign in**

In `apps/puchkaman/lib/auth/index.ts`, the `orderTracking(...)` plugin comment at lines 104-107 still reads correctly and needs no change. In `apps/puchkaman/proxy.ts:39-41` the comment above `/api/account/phone` says "Customers have no login". Replace those two comment lines with:

```ts
  // Phone verification runs during guest checkout, before any session exists.
  // Both routes are rate limited per number and per IP in the handler.
```

- [ ] **Step 6: Run the full app suite and typecheck**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/lib/auth/index.ts apps/puchkaman/lib/auth/__tests__/session-admission.test.ts apps/puchkaman/proxy.ts
git commit -m "feat(puchkaman): let customer accounts hold a session"
```

---

### Task 2: Correct the role defaults so a customer sign-in cannot mint staff

**Files:**
- Modify: `apps/puchkaman/db/schema/auth.ts:39`
- Modify: `apps/puchkaman/lib/auth/index.ts:98-101`
- Modify: `apps/puchkaman/lib/auth/session.ts:28`
- Create: `apps/puchkaman/db/migrations/0017_*.sql` (generated)
- Create: `apps/puchkaman/lib/auth/__tests__/role-defaults.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no new symbols. Later tasks rely on the behaviour that a row created without an explicit role is a `user`.

Three places default a role-less user to a **staff** role. `db/schema/auth.ts:39` defaults the column to `'member'`; `lib/auth/index.ts:99` defaults the Better Auth additional field to `Role.MEMBER`; `lib/auth/session.ts:28` falls back to `Role.MEMBER` when a session carries no role. `member` holds `order:[read,write]` and `finance:read` (`lib/auth/permissions.ts:41-48`). With OTP sign-in reachable by the public in Task 4, any of the three is a privilege-escalation path. Both writers that matter — `inviteUser` and `upsertCustomer` — pass `role` explicitly, so nothing legitimate depends on the old defaults.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/auth/__tests__/role-defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { users } from "@/db/schema";

/**
 * `member` carries order:write and finance:read. Any path that creates a user
 * without naming a role — OTP sign-in, a future social provider, a hand-written
 * INSERT — must land on the powerless role, not a staff one.
 */
describe("role defaults fail closed", () => {
  it("defaults the users.role column to the customer role", () => {
    expect(users.role.default).toBe(Role.USER);
  });

  it("does not default the column to a staff role", () => {
    expect(users.role.default).not.toBe(Role.MEMBER);
    expect(users.role.default).not.toBe(Role.ADMIN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/role-defaults.test.ts`
Expected: FAIL — received `"member"`, expected `"user"`.

- [ ] **Step 3: Change the column default**

In `apps/puchkaman/db/schema/auth.ts`, line 39 currently reads:

```ts
  role: userRole("role").notNull().default("member"),
```

Replace with:

```ts
  // Fails closed: `member` holds order:write and finance:read, so a row created
  // without an explicit role must never land on it. Invites and checkout both
  // pass `role` themselves.
  role: userRole("role").notNull().default("user"),
```

- [ ] **Step 4: Change the Better Auth additional-field default**

In `apps/puchkaman/lib/auth/index.ts`, line 99 currently reads:

```ts
      role: { type: "string", required: false, defaultValue: Role.MEMBER, input: false },
```

Replace with:

```ts
      role: { type: "string", required: false, defaultValue: Role.USER, input: false },
```

- [ ] **Step 5: Change the session read-path fallback**

In `apps/puchkaman/lib/auth/session.ts`, line 28 currently reads:

```ts
  return { user: { id: u.publicId, role: u.role ?? Role.MEMBER, email: u.email ?? "" } };
```

Replace with:

```ts
  // A session that somehow carries no role authorizes as a customer, never as
  // staff — the read path must agree with the fail-closed column default.
  return { user: { id: u.publicId, role: u.role ?? Role.USER, email: u.email ?? "" } };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/role-defaults.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Generate the migration**

Run: `pnpm --filter puchkaman db:generate`
Expected: a new `apps/puchkaman/db/migrations/0017_*.sql` containing an `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';`.

Open the generated file and confirm it contains **only** that default change. If drizzle-kit emitted anything else — a dropped index, a re-created enum, a missing `id_seq`/`next_id`/`current_app_id` helper — stop and report it rather than applying. Do not edit any file numbered 0016 or lower.

- [ ] **Step 8: Apply and verify against the local database**

Run: `pnpm --filter puchkaman db:migrate`

Then confirm the live default:

```bash
psql "$DATABASE_URL" -c "select column_default from information_schema.columns where table_name='users' and column_name='role';"
```

Expected: `'user'::user_role`.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/puchkaman/db/schema/auth.ts apps/puchkaman/lib/auth/index.ts apps/puchkaman/lib/auth/session.ts apps/puchkaman/lib/auth/__tests__/role-defaults.test.ts apps/puchkaman/db/migrations
git commit -m "fix(puchkaman): default a role-less user to customer, not staff"
```

---

### Task 3: Stop guest checkout from overwriting a real account's profile

**Files:**
- Modify: `apps/puchkaman/lib/customers/upsert-customer.ts:13-57`
- Create: `apps/puchkaman/lib/customers/__tests__/upsert-customer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `customerUpdateSet` — the `onConflictDoUpdate` `set` clause, exported from `apps/puchkaman/lib/customers/upsert-customer.ts` purely so it can be asserted on. No later task consumes it.

`upsertCustomer` COALESCE-updates `name` and `phone` on email conflict. While customers had no login this only affected a notification recipient. Once a customer holds an account, anyone who types a stranger's email at checkout writes to that stranger's profile. The fix guards the update on the target row not being a real account.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/customers/__tests__/upsert-customer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { customerUpdateSet } from "../upsert-customer";

/**
 * A guest checkout may fill in blanks on a record that was never claimed. It may
 * not write to an account someone actually signed into — otherwise ordering with
 * a stranger's email rewrites their profile.
 */
describe("customerUpdateSet", () => {
  const sql = (v: unknown) => JSON.stringify(v);

  it("guards both writable columns on the row not being a claimed account", () => {
    for (const column of ["name", "phone"] as const) {
      const clause = sql(customerUpdateSet[column]);
      expect(clause).toContain("password_set");
      expect(clause).toContain("email_verified");
    }
  });

  it("never writes role or status", () => {
    expect(customerUpdateSet).not.toHaveProperty("role");
    expect(customerUpdateSet).not.toHaveProperty("status");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/customers/__tests__/upsert-customer.test.ts`
Expected: FAIL — `customerUpdateSet` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `apps/puchkaman/lib/customers/upsert-customer.ts`, replace the docblock at lines 13-23 and the `.onConflictDoUpdate({...})` call at lines 41-52 so the file reads:

```ts
/**
 * Find-or-create the `users` row that owns an order.
 *
 * The row starts with role `user`, no `account` row, and `passwordSet: false`,
 * so it holds no credential until the customer chooses to sign in. It exists so
 * notifications have a recipient and orders have an owner.
 *
 * Called inside the caller's transaction so a customer is never created for an
 * order that rolls back.
 */

/**
 * COALESCE fills blanks only, so a later order with a typo'd name cannot
 * overwrite a good one. The `case` guard is the second half: once a row is a
 * real account (a password was set, or the address was verified), a guest
 * checkout quoting that email may not write to it at all. `role` and `status`
 * are absent by design — an existing staff account sharing the address stays
 * staff, and demoting one would lock a colleague out of the dashboard.
 */
export const customerUpdateSet = {
  name: sql`case when ${users.passwordSet} or ${users.emailVerified} then ${users.name}
             else coalesce(${users.name}, excluded.name) end`,
  phone: sql`case when ${users.passwordSet} or ${users.emailVerified} then ${users.phone}
             else coalesce(${users.phone}, excluded.phone) end`,
};

export async function upsertCustomer(tx: Tx, input: UpsertCustomerInput): Promise<bigint> {
  const email = input.email.trim().toLowerCase();

  const [row] = await tx
    .insert(users)
    .values({
      email,
      name: input.name ?? null,
      phone: input.phone ?? null,
      role: "user",
      status: "active",
      passwordSet: false,
    })
    .onConflictDoUpdate({
      target: users.email,
      // users_email_unique is a PARTIAL index (`where email is not null`).
      // Postgres only infers a partial index when the ON CONFLICT clause repeats
      // its predicate; without this it raises "there is no unique or exclusion
      // constraint matching the ON CONFLICT specification".
      targetWhere: sql`${users.email} is not null`,
      set: customerUpdateSet,
    })
    .returning({ id: users.id });

  if (!row) throw new Error(`upsertCustomer returned no row for ${email}`);
  return row.id;
}
```

Keep the existing imports and the `Tx` / `UpsertCustomerInput` declarations at the top of the file unchanged. Confirm `emailVerified` is the property name on the `users` table in `apps/puchkaman/db/schema/auth.ts`; if the schema names it differently, use the schema's name.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run lib/customers/__tests__/upsert-customer.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify the SQL actually runs**

The test asserts the shape of the clause, not that Postgres accepts it. Exercise the real statement once against the local database:

```bash
psql "$DATABASE_URL" -c "begin;
insert into users (email, name, phone, role, status, password_set)
values ('plan-check@example.com', 'First', '5550001111', 'user', 'active', false)
on conflict (email) where email is not null do nothing;
update users set password_set = true where email = 'plan-check@example.com';
insert into users (email, name, phone, role, status, password_set)
values ('plan-check@example.com', 'Attacker', '5559999999', 'user', 'active', false)
on conflict (email) where email is not null do update set
  name = case when users.password_set or users.email_verified then users.name
              else coalesce(users.name, excluded.name) end;
select name from users where email = 'plan-check@example.com';
rollback;"
```

Expected: `First`. If it returns `Attacker`, the guard is wrong — fix before committing.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/lib/customers/upsert-customer.ts apps/puchkaman/lib/customers/__tests__/upsert-customer.test.ts
git commit -m "fix(puchkaman): guest checkout must not overwrite a claimed account"
```

---

### Task 4: Route each role to its own landing after sign-in

**Files:**
- Create: `apps/puchkaman/lib/auth/landing.ts`
- Create: `apps/puchkaman/lib/auth/__tests__/landing.test.ts`
- Modify: `apps/puchkaman/app/(auth)/login/login-form.tsx:80, 191` and the brand panel copy at `:53-56`

**Interfaces:**
- Consumes: nothing.
- Produces: `landingPathFor(role: string | null | undefined, callbackUrl?: string | null): string`, exported from `apps/puchkaman/lib/auth/landing.ts`. Task 6 links to the paths it returns.

Both sign-in paths currently hard-code `/dashboard`, which a customer cannot enter — they would be bounced straight back to `/login`. The callback URL must not be honoured blindly either: it arrives from the query string, so an off-site value is an open redirect, and a `/dashboard` value from a customer is a redirect loop.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/auth/__tests__/landing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { landingPathFor } from "../landing";

describe("landingPathFor", () => {
  it("sends a customer to their own area", () => {
    expect(landingPathFor("user")).toBe("/me");
  });

  it("sends staff to the dashboard", () => {
    expect(landingPathFor("admin")).toBe("/dashboard");
    expect(landingPathFor("member")).toBe("/dashboard");
  });

  it("treats an unknown or missing role as a customer", () => {
    expect(landingPathFor(null)).toBe("/me");
    expect(landingPathFor(undefined)).toBe("/me");
    expect(landingPathFor("something-new")).toBe("/me");
  });

  it("honours a same-site callback the role may actually reach", () => {
    expect(landingPathFor("admin", "/dashboard/orders")).toBe("/dashboard/orders");
    expect(landingPathFor("user", "/me/orders")).toBe("/me/orders");
  });

  it("refuses a callback the role cannot reach, rather than looping", () => {
    expect(landingPathFor("user", "/dashboard/orders")).toBe("/me");
    expect(landingPathFor("admin", "/me/orders")).toBe("/dashboard");
  });

  it.each([
    "https://evil.example.com/phish",
    "//evil.example.com",
    "/\\evil.example.com",
    "javascript:alert(1)",
  ])("refuses the off-site callback %s", (callback) => {
    expect(landingPathFor("admin", callback)).toBe("/dashboard");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/landing.test.ts`
Expected: FAIL — cannot resolve `../landing`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/puchkaman/lib/auth/landing.ts`:

```ts
import { Role } from "@realm/commons";

const STAFF_HOME = "/dashboard";
const CUSTOMER_HOME = "/me";

const isStaff = (role: string | null | undefined): boolean =>
  role === Role.ADMIN || role === Role.MEMBER;

/**
 * `callbackUrl` arrives from the query string, so it is attacker-controlled.
 * A leading "//" or "/\" is a protocol-relative URL the browser treats as
 * off-site, which is why a plain startsWith("/") check is not enough.
 */
function isSameSitePath(candidate: string): boolean {
  return candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.startsWith("/\\");
}

/**
 * Where a freshly signed-in session belongs. A customer bounced to /dashboard
 * gets redirected straight back to /login, so honouring a callback the role
 * cannot reach produces a loop, not a destination.
 */
export function landingPathFor(role: string | null | undefined, callbackUrl?: string | null): string {
  const home = isStaff(role) ? STAFF_HOME : CUSTOMER_HOME;
  if (!callbackUrl || !isSameSitePath(callbackUrl)) return home;

  const reachable = isStaff(role)
    ? callbackUrl.startsWith(STAFF_HOME)
    : callbackUrl.startsWith(CUSTOMER_HOME);
  return reachable ? callbackUrl : home;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run lib/auth/__tests__/landing.test.ts`
Expected: PASS, 11 assertions across 6 tests.

- [ ] **Step 5: Use it in both sign-in paths**

In `apps/puchkaman/app/(auth)/login/login-form.tsx`, add the import beside the existing auth-client import at line 22:

```ts
import { landingPathFor } from "@/lib/auth/landing";
```

In `PasswordPanel.onSubmit`, replace line 80:

```ts
    router.push(params.get("callbackUrl") ?? "/dashboard");
```

with:

```ts
    const role = (result?.data?.user as { role?: string } | undefined)?.role;
    router.push(landingPathFor(role, params.get("callbackUrl")));
```

In `EmailOtpPanel.verify`, replace line 191:

```ts
    router.push(params.get("callbackUrl") ?? "/dashboard");
```

with:

```ts
    const role = (result?.data?.user as { role?: string } | undefined)?.role;
    router.push(landingPathFor(role, params.get("callbackUrl")));
```

- [ ] **Step 6: Soften the staff-only brand copy**

Customers now land on this page. In the same file, replace the copy at line 55:

```tsx
            <p className="text-balance text-center text-sm opacity-80">Operations console for staff.</p>
```

with:

```tsx
            <p className="text-balance text-center text-sm opacity-80">
              Sign in to track your orders — or to reach the operations console.
            </p>
```

Confirm `"use client"` is still line 1 of this file.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/puchkaman/lib/auth/landing.ts apps/puchkaman/lib/auth/__tests__/landing.test.ts "apps/puchkaman/app/(auth)/login/login-form.tsx"
git commit -m "feat(puchkaman): route each role to its own landing after sign-in"
```

---

### Task 5: Gate `/me` in the edge proxy

**Files:**
- Modify: `apps/puchkaman/proxy.ts:51-71`
- Modify: `apps/puchkaman/__tests__/proxy-public-api.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PROTECTED_PREFIXES: string[]`, exported from `apps/puchkaman/proxy.ts`.

The proxy does cookie-presence checks only; the authoritative role check stays in the layout (Task 6). Both `/dashboard` and `/me` need the same treatment, so the rule becomes a list rather than a second `if`.

- [ ] **Step 1: Write the failing test**

Append to `apps/puchkaman/__tests__/proxy-public-api.test.ts`:

```ts
import { PROTECTED_PREFIXES } from "../proxy";

/**
 * /me holds a customer's order history and contact details. Without a prefix
 * entry it renders for anyone with the URL, because the matcher — not the
 * handler — is what decides whether proxy() is consulted at all.
 */
describe("PROTECTED_PREFIXES", () => {
  it.each(["/dashboard", "/me"])("requires a session cookie under %s", (prefix) => {
    expect(PROTECTED_PREFIXES).toContain(prefix);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run __tests__/proxy-public-api.test.ts`
Expected: FAIL — `PROTECTED_PREFIXES` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `apps/puchkaman/proxy.ts`, add after the `PUBLIC_API` array (after line 42):

```ts
/**
 * Prefixes that require a session cookie. Cookie presence only — the
 * authoritative role check lives in each route group's layout, which is also
 * what decides that a customer at /dashboard goes to /me rather than /login.
 */
export const PROTECTED_PREFIXES = ["/dashboard", "/me"];
```

Then replace the body of `proxy()` from line 61 to line 68 with:

```ts
  const protectedPrefix = PROTECTED_PREFIXES.find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (protectedPrefix && !hasSession) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
  const res = NextResponse.next();
  if (protectedPrefix) res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
```

And extend the matcher on the last line:

```ts
export const config = { matcher: ["/dashboard/:path*", "/me/:path*", "/api/:path*"] };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run __tests__/proxy-public-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/puchkaman/proxy.ts apps/puchkaman/__tests__/proxy-public-api.test.ts
git commit -m "feat(puchkaman): gate /me behind a session in the proxy"
```

---

### Task 6: Customer shell and `/me` home

**Files:**
- Create: `apps/puchkaman/app/(customer)/layout.tsx`
- Create: `apps/puchkaman/app/(customer)/me/page.tsx`
- Create: `apps/puchkaman/components/customer/customer-nav.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/layout.tsx:21`
- Create: `apps/puchkaman/lib/customers/__tests__/my-orders.test.ts`
- Create: `apps/puchkaman/lib/customers/my-orders.ts`

**Interfaces:**
- Consumes: `landingPathFor` is not used here; the layout redirects directly.
- Produces:
  - `myOrders(userPublicId: string): Promise<MyOrderSummary[]>` from `apps/puchkaman/lib/customers/my-orders.ts`
  - `type MyOrderSummary = { publicId: string; reference: string; placedAt: Date; status: string; total: number; itemCount: number; ongoing: boolean }`
  - `splitOrders(rows: MyOrderSummary[]): { ongoing: MyOrderSummary[]; past: MyOrderSummary[] }` from the same module
  - Task 7 renders both; Task 8 links to `/me/orders/${publicId}`.

The dashboard layout currently redirects anyone who is not `admin` to `/login`. A signed-in customer would loop: `/login` sees a session, sends them to `/dashboard`, which sends them back. Changing it to send customers to `/me` and non-admin staff onward is required for this slice to be usable, and it simultaneously unblocks `member`, whose permissions already exist and are already enforced per-route.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/customers/__tests__/my-orders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitOrders, type MyOrderSummary } from "../my-orders";

const order = (over: Partial<MyOrderSummary>): MyOrderSummary => ({
  publicId: "ord_1",
  reference: "ord_1",
  placedAt: new Date("2026-08-01T10:00:00Z"),
  status: "paid",
  total: 24.5,
  itemCount: 3,
  ongoing: true,
  ...over,
});

describe("splitOrders", () => {
  it("puts ongoing orders first and terminal ones in past", () => {
    const rows = [
      order({ publicId: "ord_done", ongoing: false }),
      order({ publicId: "ord_live", ongoing: true }),
    ];
    const { ongoing, past } = splitOrders(rows);
    expect(ongoing.map((o) => o.publicId)).toEqual(["ord_live"]);
    expect(past.map((o) => o.publicId)).toEqual(["ord_done"]);
  });

  it("keeps each group newest-first", () => {
    const rows = [
      order({ publicId: "old", ongoing: false, placedAt: new Date("2026-01-01") }),
      order({ publicId: "new", ongoing: false, placedAt: new Date("2026-08-01") }),
    ];
    expect(splitOrders(rows).past.map((o) => o.publicId)).toEqual(["new", "old"]);
  });

  it("returns empty groups rather than undefined for a customer with no orders", () => {
    expect(splitOrders([])).toEqual({ ongoing: [], past: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/customers/__tests__/my-orders.test.ts`
Expected: FAIL — cannot resolve `../my-orders`.

- [ ] **Step 3: Write the query module**

Create `apps/puchkaman/lib/customers/my-orders.ts`:

```ts
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderItems, orders, users } from "@/db/schema";

export type MyOrderSummary = {
  publicId: string;
  reference: string;
  placedAt: Date;
  status: string;
  total: number;
  itemCount: number;
  ongoing: boolean;
};

/** Mirrors isTerminal() in lib/order-tracking/load.ts — one definition of "done". */
const TERMINAL = new Set(["fulfilled", "cancelled", "failed"]);

export function splitOrders(rows: MyOrderSummary[]): {
  ongoing: MyOrderSummary[];
  past: MyOrderSummary[];
} {
  const byNewest = [...rows].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
  return {
    ongoing: byNewest.filter((o) => o.ongoing),
    past: byNewest.filter((o) => !o.ongoing),
  };
}

/**
 * Scoped by the caller's own publicId, resolved to the bigint id here rather
 * than taken from the caller — the session exposes publicId only, and joining
 * on it is what keeps one customer's history from being addressable by another.
 */
export async function myOrders(userPublicId: string): Promise<MyOrderSummary[]> {
  const rows = await db
    .select({
      publicId: orders.publicId,
      placedAt: orders.createdAt,
      status: orders.status,
      total: orders.total,
      itemCount: count(orderItems.id),
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(users.publicId, userPublicId))
    .groupBy(orders.publicId, orders.createdAt, orders.status, orders.total)
    .orderBy(desc(orders.createdAt));

  return rows.map((r) => ({
    publicId: r.publicId,
    reference: r.publicId,
    placedAt: r.placedAt,
    status: r.status,
    total: r.total ? Number(r.total) : 0,
    itemCount: Number(r.itemCount),
    ongoing: !TERMINAL.has(r.status),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run lib/customers/__tests__/my-orders.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the customer nav**

Create `apps/puchkaman/components/customer/customer-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@realm/ui/lib/utils";

const LINKS = [
  { href: "/me", label: "Overview" },
  { href: "/me/orders", label: "Orders" },
  { href: "/me/account", label: "Account" },
];

export function CustomerNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-2" aria-label="Your account">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Confirm `cn` is exported from `@realm/ui/lib/utils`; if the barrel path differs in this repo, use the path the dashboard components already import it from.

- [ ] **Step 6: Write the customer layout**

Create `apps/puchkaman/app/(customer)/layout.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CrmShell } from "@realm/crm";
import { Toaster } from "@realm/ui/sonner";
import { TooltipProvider } from "@realm/ui/tooltip";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { CustomerNav } from "@/components/customer/customer-nav";
import { AppBrand } from "@/components/dashboard/app-brand";
import { ModeToggle } from "@/components/mode-toggle";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me");
  // Staff have their own console; sending them here would hide the tools they
  // signed in for behind a customer shell.
  if (session.user.role !== "user") redirect("/dashboard");

  const [u] = await db
    .select({ name: users.name, status: users.status })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");
  // Re-check on the read path: the sign-in gate stops a suspended account
  // getting a session, but one issued before the suspension stays usable.
  if (u.status !== "active") redirect("/login?suspended=1");

  return (
    <div className="crm-app">
      <TooltipProvider>
        <CrmShell
          hideSidebarOnMobile
          brand={<AppBrand href="/me" />}
          sidebar={<CustomerNav />}
          actions={<ModeToggle />}
        >
          {children}
        </CrmShell>
        <Toaster position="top-right" />
      </TooltipProvider>
    </div>
  );
}
```

Open `packages/crm/src/crm-shell.tsx` and confirm every prop used here exists and that `breadcrumbs` / `bottomNav` are optional. If either is required, pass `breadcrumbs={null}` and `bottomNav={null}`.

- [ ] **Step 7: Write the `/me` home page**

Create `apps/puchkaman/app/(customer)/me/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, PageShell, SectionCard, EmptyState } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { getSession } from "@/lib/auth/session";
import { myOrders, splitOrders } from "@/lib/customers/my-orders";
import { OrderSummaryList } from "@/components/customer/order-summary-list";

// Every read here is per-viewer and live; a cached render would show one
// customer's orders to another.
export const dynamic = "force-dynamic";

export default async function CustomerHomePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me");

  const { ongoing, past } = splitOrders(await myOrders(session.user.id));

  return (
    <PageShell>
      <PageHeader title="Your orders" description="Everything you've ordered, ongoing first." />
      <SectionCard title="Ongoing">
        {ongoing.length === 0 ? (
          <EmptyState
            title="Nothing in progress"
            description="When you place an order it shows up here."
            action={
              <Button asChild>
                <Link href="/eats">Browse the menu</Link>
              </Button>
            }
          />
        ) : (
          <OrderSummaryList orders={ongoing} />
        )}
      </SectionCard>
      {past.length > 0 ? (
        <SectionCard title="Past orders">
          <OrderSummaryList orders={past.slice(0, 5)} />
          {past.length > 5 ? (
            <Button asChild variant="ghost">
              <Link href="/me/orders">See all {past.length} orders</Link>
            </Button>
          ) : null}
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
```

`OrderSummaryList` is created in Task 7. Until then this file will not typecheck — that is expected; Step 9 runs typecheck only after Task 7 for this reason. If you are executing tasks strictly one at a time, create Task 7's component first and return here.

- [ ] **Step 8: Stop the dashboard layout bouncing customers to `/login`**

In `apps/puchkaman/app/(dashboard)/dashboard/layout.tsx`, line 21 currently reads:

```ts
  if (!session?.user || session.user.role !== "admin") redirect("/login");
```

Replace with:

```ts
  if (!session?.user) redirect("/login");
  // A customer here is a wrong turn, not an intrusion — sending them to /login
  // would loop, because /login sees their valid session and sends them back.
  if (session.user.role === "user") redirect("/me");
```

This admits `member`, whose permissions are defined at `lib/auth/permissions.ts:41-48` and already enforced by the `requirePermission` calls inside each route and server action.

- [ ] **Step 9: Verify (after Task 7's component exists)**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/puchkaman/lib/customers/my-orders.ts apps/puchkaman/lib/customers/__tests__/my-orders.test.ts "apps/puchkaman/app/(customer)" apps/puchkaman/components/customer "apps/puchkaman/app/(dashboard)/dashboard/layout.tsx"
git commit -m "feat(puchkaman): customer shell and /me overview"
```

---

### Task 7: Order history list at `/me/orders`

**Files:**
- Create: `apps/puchkaman/components/customer/order-summary-list.tsx`
- Create: `apps/puchkaman/app/(customer)/me/orders/page.tsx`

**Interfaces:**
- Consumes: `myOrders`, `splitOrders`, `MyOrderSummary` from `apps/puchkaman/lib/customers/my-orders.ts` (Task 6).
- Produces: `OrderSummaryList({ orders }: { orders: MyOrderSummary[] })` from `apps/puchkaman/components/customer/order-summary-list.tsx`. Task 6's home page renders it.

- [ ] **Step 1: Write the list component**

Create `apps/puchkaman/components/customer/order-summary-list.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@realm/ui/badge";
import type { MyOrderSummary } from "@/lib/customers/my-orders";

const money = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(d);

export function OrderSummaryList({ orders }: { orders: MyOrderSummary[] }) {
  return (
    <ul className="divide-border divide-y">
      {orders.map((order) => (
        <li key={order.publicId}>
          <Link
            href={`/me/orders/${order.publicId}`}
            className="hover:bg-accent/50 flex items-center justify-between gap-4 px-2 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{order.reference}</p>
              <p className="text-muted-foreground text-sm">
                {day(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge variant={order.ongoing ? "default" : "secondary"}>{order.status}</Badge>
              <span className="tabular-nums">{money(order.total)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

This is a server component by design — it holds no state and no handlers, so it must NOT get a `"use client"` directive. Confirm `Badge` is exported from `@realm/ui/badge`; if the path differs, follow what `components/admin` already imports.

- [ ] **Step 2: Write the full history page**

Create `apps/puchkaman/app/(customer)/me/orders/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { getSession } from "@/lib/auth/session";
import { myOrders, splitOrders } from "@/lib/customers/my-orders";
import { OrderSummaryList } from "@/components/customer/order-summary-list";

export const dynamic = "force-dynamic";

export default async function CustomerOrdersPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/orders");

  const { ongoing, past } = splitOrders(await myOrders(session.user.id));

  if (ongoing.length === 0 && past.length === 0) {
    return (
      <PageShell>
        <PageHeader title="Orders" />
        <EmptyState
          title="No orders yet"
          description="Your order history will appear here once you've ordered."
          action={
            <Button asChild>
              <Link href="/eats">Browse the menu</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Orders" description="Ongoing first, then everything before." />
      {ongoing.length > 0 ? (
        <SectionCard title="Ongoing">
          <OrderSummaryList orders={ongoing} />
        </SectionCard>
      ) : null}
      {past.length > 0 ? (
        <SectionCard title="Past">
          <OrderSummaryList orders={past} />
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
```

- [ ] **Step 3: Confirm the design-system imports resolve**

Run: `pnpm turbo typecheck --filter=puchkaman`

`PageShell`, `PageHeader`, `SectionCard` and `EmptyState` come from `@realm/design-system`. If puchkaman re-exports them through a local barrel the way tiffin-grab does at `components/ds/index.ts`, import from that barrel instead and re-run.

- [ ] **Step 4: Run the full suite**

Run: `pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/components/customer/order-summary-list.tsx "apps/puchkaman/app/(customer)/me/orders/page.tsx"
git commit -m "feat(puchkaman): customer order history at /me/orders"
```

---

### Task 8: Order detail at `/me/orders/[publicId]`

**Files:**
- Create: `apps/puchkaman/app/(customer)/me/orders/[publicId]/page.tsx`

**Interfaces:**
- Consumes: `loadTrackedOrder` from `apps/puchkaman/lib/order-tracking/load.ts`; `TrackingView` from `apps/puchkaman/components/order/tracking-view.tsx`; `auth` from `apps/puchkaman/lib/auth`.
- Produces: nothing consumed elsewhere.

No new authorization logic. `decideTrackingAccess` (`packages/order-tracking/src/access.ts:43`) already returns `granted` when the viewer's id equals `subject.ownerUserId`, and both sides are the stringified bigint `users.id` — `resolveTrackingSubject` stringifies `orders.userId` (`lib/order-tracking/subject.ts:20`), and `viewerId()` stringifies `session.user.id` inside the plugin (`packages/order-tracking/src/plugin.ts:35-38`). The grant endpoint is therefore the whole check: an owner is granted, a non-owner without the PIN cookie is not.

- [ ] **Step 1: Write the page**

Create `apps/puchkaman/app/(customer)/me/orders/[publicId]/page.tsx`:

```tsx
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PageHeader, PageShell } from "@realm/design-system";
import { TrackingView } from "@/components/order/tracking-view";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import { loadTrackedOrder } from "@/lib/order-tracking/load";

export const dynamic = "force-dynamic";

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const session = await getSession();
  if (!session?.user) redirect(`/login?callbackUrl=/me/orders/${publicId}`);

  // Same grant the public /track page uses. An owner is granted without a PIN
  // because decideTrackingAccess matches the viewer against orders.user_id, so
  // this route needs no ownership check of its own — and must not invent a
  // second one that could disagree with it.
  const grant = await auth.api
    .getOrderTrackingGrant({ query: { orderId: publicId }, headers: await headers() })
    .catch(() => null);

  // Not theirs, or no such order. Both are a 404 here: a signed-in customer has
  // no business being told that someone else's order exists.
  if (!grant?.granted) notFound();

  const order = await loadTrackedOrder(publicId);
  if (!order) notFound();

  return (
    <PageShell>
      <PageHeader title={`Order ${order.reference}`} description={order.fulfillment.summary} />
      <TrackingView order={order} />
    </PageShell>
  );
}
```

- [ ] **Step 2: Check TrackingView renders outside the marketing shell**

`TrackingView` is used today only inside `(marketing)`, whose `globals.css` carries the brutalist public styling; `(customer)` renders inside `.crm-app`. Open `apps/puchkaman/components/order/tracking-view.tsx` and check whether it depends on classes or CSS variables defined only under the marketing styles (`--ink`, `--yellow`, brutal shadow utilities).

If it does, do NOT restyle the component — the public `/track` page depends on it. Wrap the render in this page instead:

```tsx
      <div className="brutal-scope">
        <TrackingView order={order} />
      </div>
```

and confirm a `.brutal-scope` (or the equivalent already used to scope brutal styling in this app) exists. If no such scope exists, report it rather than inventing a new styling layer — that is a design decision, not an implementation detail.

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/puchkaman/app/(customer)/me/orders/[publicId]/page.tsx"
git commit -m "feat(puchkaman): customer order detail reusing the tracking grant"
```

---

### Task 9: Customer account page

**Files:**
- Create: `apps/puchkaman/app/(customer)/me/account/page.tsx`

**Interfaces:**
- Consumes: `ChangePasswordForm`, `ChangeEmailForm` from `@realm/auth-ui`; `getSession`.
- Produces: nothing consumed elsewhere.

A customer who signed in by OTP has no password. `@realm/auth-ui` already ships the forms the staff account page uses; this is composition, not new UI.

- [ ] **Step 1: Read what the staff account page already does**

Open `apps/puchkaman/app/(dashboard)/dashboard/account/change-password-form.tsx` and `change-email-form.tsx` and note exactly which props each `@realm/auth-ui` component takes and which client wrappers exist. Reuse those wrappers if they are not dashboard-specific.

- [ ] **Step 2: Write the page**

Create `apps/puchkaman/app/(customer)/me/account/page.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CustomerAccountPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/account");

  const [u] = await db
    .select({ name: users.name, email: users.email, phone: users.phone, passwordSet: users.passwordSet })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");

  return (
    <PageShell>
      <PageHeader title="Account" description="Your details and how you sign in." />
      <SectionCard title="Details">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd>{u.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{u.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{u.phone ?? "—"}</dd>
          </div>
        </dl>
      </SectionCard>
      <SectionCard
        title="Sign-in"
        description={
          u.passwordSet
            ? "You can sign in with a password or an emailed code."
            : "You sign in with an emailed code. Setting a password is optional."
        }
      >
        {/* Wire the @realm/auth-ui password/email forms found in Step 1 here,
            using the same client wrappers the staff account page uses. */}
      </SectionCard>
    </PageShell>
  );
}
```

- [ ] **Step 3: Mount the auth-ui forms**

Replace the comment placeholder in the "Sign-in" `SectionCard` with the wrappers identified in Step 1 — the change-password form when `u.passwordSet` is true, and the same form's set-a-password variant when it is false. Do not write new password logic; `@realm/auth-ui` and the existing `/set-password` action already own it.

If the staff wrappers turn out to be dashboard-coupled (importing dashboard layout state or staff-only actions), create thin `apps/puchkaman/components/customer/account/*.tsx` client wrappers around the same `@realm/auth-ui` exports instead, each with `"use client"` on line 1.

- [ ] **Step 4: Verify**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/puchkaman/app/(customer)/me/account" apps/puchkaman/components/customer
git commit -m "feat(puchkaman): customer account page"
```

---

### Task 10: Attach checkout orders to the signed-in customer

**Files:**
- Modify: `apps/puchkaman/lib/services/orders.service.ts:713-721`
- Create: `apps/puchkaman/lib/customers/__tests__/resolve-order-owner.test.ts`
- Modify: `apps/puchkaman/lib/customers/upsert-customer.ts`

**Interfaces:**
- Consumes: `upsertCustomer` from `apps/puchkaman/lib/customers/upsert-customer.ts`.
- Produces: `resolveOrderOwner(tx, input: UpsertCustomerInput & { sessionUserPublicId?: string | null }): Promise<bigint>` from `apps/puchkaman/lib/customers/upsert-customer.ts`.

Today every checkout goes through the email upsert, so a signed-in customer ordering with a different email silently creates or attaches to a second account. When a session exists it is the better answer than the typed email.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/customers/__tests__/resolve-order-owner.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveOrderOwner, type OrderOwnerDeps } from "../upsert-customer";

function deps(over: Partial<OrderOwnerDeps> = {}): OrderOwnerDeps {
  return {
    findByPublicId: vi.fn(async () => 42n),
    upsertByEmail: vi.fn(async () => 7n),
    ...over,
  };
}

describe("resolveOrderOwner", () => {
  it("prefers the signed-in customer over the typed email", async () => {
    const d = deps();
    const id = await resolveOrderOwner(
      { email: "typed@example.com", sessionUserPublicId: "usr_abc" },
      d,
    );
    expect(id).toBe(42n);
    expect(d.upsertByEmail).not.toHaveBeenCalled();
  });

  it("falls back to the email upsert for a guest", async () => {
    const d = deps();
    const id = await resolveOrderOwner({ email: "guest@example.com" }, d);
    expect(id).toBe(7n);
    expect(d.findByPublicId).not.toHaveBeenCalled();
  });

  it("falls back to the email upsert when the session points at a deleted row", async () => {
    const d = deps({ findByPublicId: vi.fn(async () => null) });
    const id = await resolveOrderOwner(
      { email: "guest@example.com", sessionUserPublicId: "usr_gone" },
      d,
    );
    expect(id).toBe(7n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/puchkaman && pnpm vitest run lib/customers/__tests__/resolve-order-owner.test.ts`
Expected: FAIL — `resolveOrderOwner` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/puchkaman/lib/customers/upsert-customer.ts`:

```ts
export type OrderOwnerDeps = {
  findByPublicId: (publicId: string) => Promise<bigint | null>;
  upsertByEmail: (input: UpsertCustomerInput) => Promise<bigint>;
};

/**
 * Who owns this order. A live session beats the typed email: a signed-in
 * customer ordering to a work address should not fork a second account, and the
 * email field is free text that anyone can put anything into.
 */
export async function resolveOrderOwner(
  input: UpsertCustomerInput & { sessionUserPublicId?: string | null },
  deps: OrderOwnerDeps,
): Promise<bigint> {
  if (input.sessionUserPublicId) {
    const owned = await deps.findByPublicId(input.sessionUserPublicId);
    if (owned !== null) return owned;
  }
  return deps.upsertByEmail(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/puchkaman && pnpm vitest run lib/customers/__tests__/resolve-order-owner.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into checkout**

In `apps/puchkaman/lib/services/orders.service.ts`, replace lines 713-721:

```ts
    const order = await db.transaction(async (tx) => {
      // Provisioned before the order so the row has an owner from the start.
      // No credential is created — see upsertCustomer.
      const customerId = await upsertCustomer(tx, {
        email: parsed.contact.email,
        name: parsed.contact.name,
        phone: parsed.contact.phone ?? null,
      });
```

with:

```ts
    const session = await getSession();

    const order = await db.transaction(async (tx) => {
      // Provisioned before the order so the row has an owner from the start.
      // A signed-in customer owns their order directly; a guest gets the
      // credential-less row upsertCustomer creates.
      const customerId = await resolveOrderOwner(
        {
          email: parsed.contact.email,
          name: parsed.contact.name,
          phone: parsed.contact.phone ?? null,
          sessionUserPublicId: session?.user.id ?? null,
        },
        {
          findByPublicId: async (publicId) => {
            const [row] = await tx
              .select({ id: users.id })
              .from(users)
              .where(eq(users.publicId, publicId))
              .limit(1);
            return row?.id ?? null;
          },
          upsertByEmail: (i) => upsertCustomer(tx, i),
        },
      );
```

Add the needed imports at the top of `orders.service.ts`: `resolveOrderOwner` alongside the existing `upsertCustomer` import, `getSession` from `@/lib/auth/session`, and `users` / `eq` if not already imported.

**Before editing, check for an import cycle.** `lib/auth/session.ts` imports `lib/auth/index.ts`, which imports `lib/order-tracking/subject.ts`. If `orders.service.ts` is reachable from that chain, importing `getSession` here creates a cycle — the comment at `lib/order-tracking/subject.ts:8-11` records that this hazard already bit once. Verify with:

```bash
cd apps/puchkaman && rg -n "orders\.service" lib/auth lib/order-tracking
```

Expected: no matches. If there are matches, thread the caller's session id in as a parameter on the checkout entry point instead of importing `getSession` here, and report the change.

- [ ] **Step 6: Verify**

Run: `pnpm turbo typecheck --filter=puchkaman && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/lib/customers/upsert-customer.ts apps/puchkaman/lib/customers/__tests__/resolve-order-owner.test.ts apps/puchkaman/lib/services/orders.service.ts
git commit -m "feat(puchkaman): attach checkout orders to the signed-in customer"
```

---

### Task 11: End-to-end check against a running app

**Files:** none — verification only.

Automated tests here are unit-level by design (puchkaman's vitest config runs with a stub `DATABASE_URL` and no live-DB harness). The admission change, the layout redirects, and the OTP flow only meet in a running app.

- [ ] **Step 1: Seed a customer with a known email**

```bash
psql "$DATABASE_URL" -c "select public_id, email, role, status, password_set from users where role = 'user' limit 5;"
```

Pick one, or place a guest order through `/eats` checkout to create one.

- [ ] **Step 2: Start the app**

Run: `pnpm --filter puchkaman dev`

- [ ] **Step 3: Walk the customer path**

1. Visit `/me` signed out → expect a redirect to `/login?callbackUrl=/me`.
2. Choose "Email me a sign-in code instead", enter the customer's email, submit.
3. Read the code (SES in production; check the dev mail transport or the app logs locally) and enter it.
4. Expect to land on `/me`, not `/dashboard`.
5. Expect the orders that customer placed to be listed.
6. Open one → expect the detail page with no PIN prompt.
7. Visit `/dashboard` → expect a redirect back to `/me`, with no loop.

- [ ] **Step 4: Walk the staff path (regression)**

1. Sign out. Sign in as an admin with a password → expect `/dashboard`.
2. Visit `/me` → expect a redirect to `/dashboard`, with no loop.
3. Confirm the admin dashboard still loads and `/dashboard/settings/users` still works.

- [ ] **Step 5: Confirm a non-owner cannot read someone else's order**

While signed in as the customer, open `/me/orders/<publicId-of-another-customers-order>`.
Expected: 404.

- [ ] **Step 6: Report**

Record the result of each step. Any failure is a bug in this slice, not a note for later.

---

## Self-Review

**Spec coverage.** Every Slice 1 item in the spec maps to a task: session admission (1), role defaults including the `getSession` fallback found during planning (2), the `upsertCustomer` overwrite guard (3), `/me` routes and the customer shell (6, 7, 9), order detail reusing the tracking grant (8), `proxy.ts` gating (5), checkout session linking (10). The dashboard-layout change is spec'd under Slice 2 but is pulled into Task 6 because without it a signed-in customer loops between `/login` and `/dashboard` — this slice is not usable without it. Slice 2's Clover sync, `employees.user_id`, and the users-list role facet remain out of scope.

**Placeholders.** One deliberate hole remains: Task 9 Step 3 mounts `@realm/auth-ui` forms whose exact props are read in Step 1 rather than guessed, because guessing a component API produces code that typechecks against nothing. Task 8 Step 2 and Task 10 Step 5 similarly instruct a check-then-decide with both branches spelled out, including what to report rather than invent.

**Type consistency.** `MyOrderSummary` is defined in Task 6 and consumed unchanged in Task 7. `landingPathFor` (Task 4) is used only in Task 4. `resolveOrderOwner` / `OrderOwnerDeps` (Task 10) match between test and implementation. `decideSessionAdmission` returns the same discriminated union in test and implementation. Task 6's page imports `OrderSummaryList` from Task 7 — the ordering hazard is called out in Task 6 Step 7 and Step 9 rather than left to fail silently.
