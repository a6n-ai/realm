# Phase 0 — Better Auth Migration (Parity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth v5 with Better Auth in `apps/web` while preserving exact login + role-guard behavior, the bigint/`publicId` ID boundary, and all existing seeded users.

**Architecture:** Better Auth with the Drizzle (pg) adapter mapped onto the existing `users` table (`generateId: false` keeps the snowflake bigint PK). Password moves from `users.password_hash` into Better Auth's `account` table, verified with a custom bcryptjs `verify` so seeded logins keep working. DB-backed sessions + cookie replace JWT. `getSession()` and the role guards are re-pointed at the new session; the login form is rebuilt on the Better Auth client.

**Tech Stack:** Better Auth, `better-auth/adapters/drizzle`, drizzle-orm + drizzle-kit (pg), postgres-js, bcryptjs, Next.js 16 App Router, React 19, vitest.

## Global Constraints

- **Auth framework:** Better Auth only. NextAuth (`next-auth`, `@auth/drizzle-adapter`) is fully removed by end of phase.
- **ID boundary:** internal bigint `users.id` (from `next_id()`) NEVER leaves the server. Session/token expose `publicId` (`usr_…`) + `role` only. `generateId: false` so Postgres fills `users.id`.
- **Password hashing:** bcryptjs, `ROUNDS = 10` (unchanged). Custom Better Auth `password.hash`/`verify` delegate to bcryptjs.
- **Role:** custom enum `admin`/`member`/`user` (`@tiffin/commons` `Role`), preserved as a Better Auth user field exposed on the session. Guards `requireRole`/`requireStaff`/`requireAdmin` keep identical semantics.
- **Customer credential:** phone + password via the `phoneNumber` plugin; email optional. (Plugin enabled in Phase 0 schema; signup UI is Phase A.)
- **Env:** `DATABASE_URL` (existing) + new `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. `trustHost` behavior preserved for ngrok/proxied dev.
- **No secrets to client.** Server Components for pages; the login form is the only Client Component touched.
- **Commit after every task.** No `Co-Authored-By` trailer.

---

### Task 1: Spike — install Better Auth and capture the authoritative schema

De-risks every later task by letting Better Auth's own CLI emit the exact pg schema it expects, so the timestamp/`emailVerified`/`phoneNumber` reconciliation is grounded in fact, not guessed.

**Files:**
- Modify: `apps/web/package.json` (deps)
- Create (temporary): `apps/web/lib/auth/better-auth.config.ts` (minimal config for the CLI)
- Create: `docs/superpowers/plans/notes/phase0-schema-output.md` (capture CLI output + reconciliation decisions)

**Interfaces:**
- Produces: confirmed import paths (`better-auth`, `better-auth/adapters/drizzle`, `better-auth/plugins`, `better-auth/next-js`, `better-auth/react`, `better-auth/client/plugins`), and the exact required columns/types for `user`, `account`, `session`, `verification`.

- [ ] **Step 1: Install Better Auth**

```bash
cd apps/web && npm install better-auth
```

- [ ] **Step 2: Write a minimal config so the CLI can introspect**

Create `apps/web/lib/auth/better-auth.config.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// TEMPORARY config used only to run `better-auth generate`. Replaced by the
// real config in Task 3.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: { user: users } }),
  emailAndPassword: { enabled: true },
  plugins: [phoneNumber()],
});
```

- [ ] **Step 3: Run the Better Auth schema generator**

Run: `cd apps/web && npx @better-auth/cli@latest generate --config lib/auth/better-auth.config.ts --output /tmp/better-auth-schema.ts -y`
Expected: a generated drizzle schema file at `/tmp/better-auth-schema.ts` describing `user`, `account`, `session`, `verification` (+ phoneNumber fields).

If the import path or CLI invocation differs, record the working form. Read `/tmp/better-auth-schema.ts`.

- [ ] **Step 4: Record reconciliation decisions**

Write `docs/superpowers/plans/notes/phase0-schema-output.md` capturing, from the generated file:
- exact column names/types Better Auth expects on `user` (esp. `emailVerified` boolean, `createdAt`/`updatedAt`, `phoneNumber`, `phoneNumberVerified`);
- full `account`, `session`, `verification` definitions;
- the mapping plan: existing `users.email`/`image`/`name` reused as-is; `users.email_verified` (currently unused `timestamp`) converted to `boolean`; `phoneNumber`/`phoneNumberVerified` mapped to existing `phone` (+ new `phone_verified`); existing bigint epoch-ms `created_at`/`updated_at` kept, with Better Auth field mapping pointed at them (confirm the adapter tolerates `mode:"number"`; if not, note the fallback: add Better-Auth-owned `bauth_created_at`/`bauth_updated_at` timestamp columns mapped via the user schema `fields` option).
- **House-convention probe for `session`/`account`/`verification`:** these tables must follow the repo style — bigint `id` (`next_id()` default), `public_id`, and epoch-ms `created_at`/`updated_at` (`baseColumns`/`updatableColumns`). Better Auth treats `id` as a string and a bigint exceeds JS safe-int (the exact reason `users` hides its bigint behind `publicId`). **Test this in the spike:** with `generateId: false`, define `session.id` as bigint `next_id()` and run a real sign-in against a scratch DB; verify the adapter reads the session back (cookie lookup works). Record the verdict:
  - **If it works:** all three tables use `id` bigint + `public_id` + epoch-ms `created_at`/`updated_at`, Better Auth's required fields (`token`/`expiresAt`/`userId`/`ipAddress`/`userAgent` on session; `accountId`/`providerId`/`password`/… on account; `identifier`/`value`/`expiresAt` on verification) kept, and Better Auth's `createdAt`/`updatedAt` model fields mapped to `created_at`/`updated_at` via each table's `fields` option.
  - **If it breaks:** keep Better Auth's text `id` PK, but still add `public_id` + epoch-ms `created_at`/`updated_at` so the tables match house conventions everywhere except the PK type. Document which path was taken — Task 2 follows it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/auth/better-auth.config.ts docs/superpowers/plans/notes/phase0-schema-output.md
git commit -m "chore(auth): install better-auth; capture generated schema for migration"
```

---

### Task 2: Add Better Auth tables + user-column reconciliation (schema + migration)

**Files:**
- Modify: `apps/web/db/schema/auth.ts`
- Create: `apps/web/db/migrations/00XX_better_auth.sql` (via drizzle-kit generate)
- Test: `apps/web/db/schema/__tests__/auth-schema.test.ts`

**Interfaces:**
- Produces: drizzle tables `session`, `account`, `verification`; `users` gains `phoneVerified` (boolean) and `emailVerified` becomes boolean. Field names used by Better Auth config in Task 3.

- [ ] **Step 1: Write the failing schema test**

Create `apps/web/db/schema/__tests__/auth-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { account, session, users, verification } from "@/db/schema";

describe("better auth schema", () => {
  it("exposes session/account/verification tables", () => {
    expect(session).toBeDefined();
    expect(account).toBeDefined();
    expect(verification).toBeDefined();
  });
  it("account stores the credential password and references a bigint user id", () => {
    expect(account).toHaveProperty("password");
    expect(account).toHaveProperty("userId");
  });
  it("users carries boolean phoneVerified for the phoneNumber plugin", () => {
    expect(users).toHaveProperty("phoneVerified");
  });
  it("auth tables follow house conventions: publicId + created/updated timestamps", () => {
    for (const t of [session, account, verification]) {
      expect(t).toHaveProperty("publicId");
      expect(t).toHaveProperty("createdAt");
      expect(t).toHaveProperty("updatedAt");
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/web && npx vitest run db/schema/__tests__/auth-schema.test.ts`
Expected: FAIL — `session`/`account`/`verification`/`phoneVerified` not exported.

- [ ] **Step 3: Replace the NextAuth tables with Better Auth tables**

In `apps/web/db/schema/auth.ts`: using the generated definitions from `/tmp/better-auth-schema.ts` (Task 1), replace `accounts`, `sessions`, `verificationTokens` with Better Auth `account`, `session`, `verification`, built to **house conventions per the Task 1 verdict**:
- spread `updatableColumns("ses")` / `updatableColumns("act")` / `updatableColumns("ver")` to get `id` (bigint `next_id()` PK — only if the spike confirmed the adapter tolerates it; otherwise keep Better Auth's text `id` PK and add `publicId` + `created_at`/`updated_at` manually), `public_id`, `created_at`, `updated_at`;
- add each table's Better-Auth-required fields: `session` → `token` (unique), `expiresAt` (timestamptz), `userId` bigint → `users.id`, `ipAddress`, `userAgent`; `account` → `accountId`, `providerId`, `password`, `accessToken`/`refreshToken`/`idToken`/`scope`/`*ExpiresAt`, `userId` bigint → `users.id`; `verification` → `identifier`, `value`, `expiresAt` (timestamptz);
- in the Task 3 config, map Better Auth's model `createdAt`/`updatedAt` to these `created_at`/`updated_at` columns via each table's `fields` option.

Update `users`:
- change `emailVerified` to `boolean("email_verified").notNull().default(false)`;
- add `phoneVerified: boolean("phone_verified").notNull().default(false)`;
- keep `passwordHash` for now (dropped in Task 4 after data migration);
- keep `phone`, mapped to Better Auth's `phoneNumber` field in Task 3.

Update `apps/web/db/schema/index.ts` exports accordingly (export `account`, `session`, `verification`; remove old names). Grep for old imports: `git grep -n "verificationTokens\|sessionsTable\|accountsTable"`.

- [ ] **Step 4: Run the schema test to confirm it passes**

Run: `cd apps/web && npx vitest run db/schema/__tests__/auth-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the migration**

Run: `cd apps/web && npm run db:generate`
Expected: a new `db/migrations/00XX_*.sql`. Open it; confirm it creates `session`/`account`/`verification`, alters `users` (`email_verified` → boolean, add `phone_verified`), and drops `accounts`/`sessions`/`verification_tokens`. These three NextAuth tables are empty under JWT+Credentials, so dropping them loses no data. Hand-edit the generated SQL only if drizzle-kit emits a destructive reorder; keep the `users.email_verified` type change explicit (`ALTER ... TYPE boolean USING (email_verified IS NOT NULL)`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/db/schema apps/web/db/migrations
git commit -m "feat(auth): add better-auth session/account/verification tables; boolean email/phone verified"
```

---

### Task 3: Real Better Auth server + client config and Next handler

**Files:**
- Modify: `apps/web/lib/auth/index.ts` (full rewrite)
- Create: `apps/web/lib/auth/client.ts`
- Create: `apps/web/app/api/auth/[...all]/route.ts`
- Delete: `apps/web/app/api/auth/[...nextauth]/route.ts`, `apps/web/lib/auth/callbacks.ts`, `apps/web/lib/auth/resolve-user.ts`, `apps/web/lib/auth/types.ts`, `apps/web/lib/auth/better-auth.config.ts` (temp)
- Modify: `apps/web/lib/auth/password.ts` (export the hash/verify wrappers Better Auth needs — keep bcryptjs)
- Test: `apps/web/lib/auth/__tests__/password.test.ts`

**Interfaces:**
- Consumes: bcryptjs `hashPassword`/`verifyPassword` from `lib/auth/password.ts`.
- Produces: `auth` (server), `authClient` (client). `auth.api.getSession({ headers })` returns `{ user: { id, role, ... } }` where `user.id` is the mapped `publicId`. Handler at `/api/auth/[...all]`.

- [ ] **Step 1: Write the failing password-adapter test**

Add to `apps/web/lib/auth/__tests__/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { betterAuthPassword } from "@/lib/auth/password";

describe("betterAuthPassword", () => {
  it("verifies a legacy bcryptjs hash", async () => {
    const hash = await bcrypt.hash("hunter2", 10);
    expect(await betterAuthPassword.verify({ hash, password: "hunter2" })).toBe(true);
    expect(await betterAuthPassword.verify({ hash, password: "wrong" })).toBe(false);
  });
  it("hashes with bcryptjs and round-trips", async () => {
    const hash = await betterAuthPassword.hash("hunter2");
    expect(await betterAuthPassword.verify({ hash, password: "hunter2" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/password.test.ts`
Expected: FAIL — `betterAuthPassword` not exported.

- [ ] **Step 3: Add the Better Auth password adapter**

Append to `apps/web/lib/auth/password.ts`:

```ts
export const betterAuthPassword = {
  hash: (password: string) => hashPassword(password),
  verify: ({ hash, password }: { hash: string; password: string }) => verifyPassword(password, hash),
};
```

- [ ] **Step 4: Run the password test to confirm it passes**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the real server config**

Replace `apps/web/lib/auth/index.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { Role } from "@tiffin/commons";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { betterAuthPassword } from "./password";

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustHost: true,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, account, session, verification },
  }),
  advanced: { database: { generateId: false } },
  // Map Better Auth's model createdAt/updatedAt onto the house epoch-ms columns
  // on each table (created_at / updated_at from updatableColumns).
  session: { expiresIn: SESSION_MAX_AGE_S, fields: { createdAt: "createdAt", updatedAt: "updatedAt" } },
  account: { fields: { createdAt: "createdAt", updatedAt: "updatedAt" } },
  verification: { fields: { createdAt: "createdAt", updatedAt: "updatedAt" } },
  emailAndPassword: {
    enabled: true,
    password: betterAuthPassword,
    // Phase A wires real reset; stub the send here so the flow works now.
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] password reset for ${user.email ?? user.id}: ${url}`);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      console.info(`[auth] verify email for ${user.email ?? user.id}: ${url}`);
    },
  },
  user: {
    // Map Better Auth's `phoneNumber` model field onto the existing `phone` column.
    fields: { phoneNumber: "phone", phoneNumberVerified: "phoneVerified" },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: Role.USER, input: false },
      publicId: { type: "string", required: false, input: false },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        console.info(`[auth] phone OTP for ${phone}: ${code}`);
      },
    }),
    nextCookies(),
  ],
});
```

If Task 1 found that the adapter rejects the bigint epoch-ms user timestamps, apply the documented fallback from the notes (Better-Auth-owned timestamp columns) here and in `auth.ts`.

- [ ] **Step 6: Write the client config**

Create `apps/web/lib/auth/client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [phoneNumberClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
```

- [ ] **Step 7: Wire the Next.js route handler and delete NextAuth files**

Create `apps/web/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

Delete: `app/api/auth/[...nextauth]/route.ts`, `lib/auth/callbacks.ts`, `lib/auth/resolve-user.ts`, `lib/auth/types.ts`, `lib/auth/better-auth.config.ts`.

- [ ] **Step 8: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: errors ONLY in files that still import the deleted modules / `auth()` (fixed in Task 5). Note them; do not fix unrelated call sites yet.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/auth apps/web/app/api/auth
git commit -m "feat(auth): better-auth server+client config, next handler, phoneNumber plugin"
```

---

### Task 4: Migrate seeded passwords into the account table

**Files:**
- Create: `apps/web/db/migrate-passwords.ts`
- Modify: `apps/web/package.json` (add `db:migrate:passwords` script)
- Modify: `apps/web/db/schema/auth.ts` (drop `passwordHash` after backfill)
- Test: `apps/web/db/__tests__/migrate-passwords.test.ts`

**Interfaces:**
- Consumes: `users` (with `passwordHash`), `account` table.
- Produces: one `account` row per credentialed user (`providerId="credential"`, `accountId=users.id::text`, `password=passwordHash`, `id` generated).

- [ ] **Step 1: Write the failing test (pure backfill mapper)**

Create `apps/web/db/__tests__/migrate-passwords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toAccountRows } from "@/db/migrate-passwords";

describe("toAccountRows", () => {
  it("maps credentialed users to credential account rows", () => {
    const rows = toAccountRows([
      { id: 10n, passwordHash: "$2a$10$abc" },
      { id: 11n, passwordHash: null },
    ]);
    expect(rows).toEqual([
      { accountId: "10", providerId: "credential", userId: 10n, password: "$2a$10$abc" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/web && npx vitest run db/__tests__/migrate-passwords.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapper + runner**

Create `apps/web/db/migrate-passwords.ts`:

```ts
import { isNotNull } from "drizzle-orm";
import { db } from "./client";
import { account, users } from "./schema";

export type CredUser = { id: bigint; passwordHash: string | null };

export function toAccountRows(rows: CredUser[]) {
  return rows
    .filter((r): r is CredUser & { passwordHash: string } => !!r.passwordHash)
    .map((r) => ({ accountId: String(r.id), providerId: "credential", userId: r.id, password: r.passwordHash }));
}

export async function run() {
  const rows = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(isNotNull(users.passwordHash));
  const values = toAccountRows(rows);
  if (values.length) await db.insert(account).values(values);
  console.info(`[migrate-passwords] inserted ${values.length} credential accounts`);
}

if (process.argv[1]?.endsWith("migrate-passwords.ts")) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
```

Add to `package.json` scripts: `"db:migrate:passwords": "tsx db/migrate-passwords.ts"`.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd apps/web && npx vitest run db/__tests__/migrate-passwords.test.ts`
Expected: PASS.

- [ ] **Step 5: Drop `passwordHash` from the schema (after-backfill)**

Remove `passwordHash` from `users` in `db/schema/auth.ts`. Run `npm run db:generate` to emit the drop migration. (Operationally the runbook is: apply Task 2 migration → `db:migrate:passwords` → apply this drop migration. Document this order at the top of the new migration file as a comment.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/db apps/web/package.json
git commit -m "feat(auth): backfill credential accounts from password_hash; drop password_hash"
```

---

### Task 5: Re-point session access, guards, and audit actor at Better Auth

**Files:**
- Create: `apps/web/lib/auth/session.ts`
- Modify: `apps/web/lib/auth/guards.ts`
- Modify: `apps/web/lib/services/session-service.ts:11-22` (`sessionActorId`)
- Modify: every `await auth()` call site (grep) — primarily `app/(dashboard)/dashboard/account/page.tsx`
- Test: `apps/web/lib/auth/__tests__/guards.test.ts` (update existing)

**Interfaces:**
- Produces: `getSession()` → `Promise<{ user: { id: string; role: RoleValue } } | null>` where `user.id` is `publicId`. Drop-in for the old `auth()` shape (`session.user.id`, `session.user.role`).

- [ ] **Step 1: Write `getSession`**

Create `apps/web/lib/auth/session.ts`:

```ts
import { headers } from "next/headers";
import { Role, type RoleValue } from "@tiffin/commons";
import { auth } from "./index";

export async function getSession() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) return null;
  const u = s.user as { publicId?: string; id: string; role?: RoleValue };
  return { user: { id: u.publicId ?? u.id, role: u.role ?? Role.USER } };
}
```

- [ ] **Step 2: Update the guards test to the new session shape**

In `apps/web/lib/auth/__tests__/guards.test.ts`, mock `@/lib/auth/session`'s `getSession` instead of `@/lib/auth`'s `auth`. Keep the existing assertions: `requireStaff` allows `admin`/`member`, throws `ForbiddenError` for `user`; `requireAdmin` admin-only; no session → `AuthError`. (Repeat the full updated test body here when implementing; preserve the original cases.)

- [ ] **Step 3: Run the guards test to confirm it fails**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/guards.test.ts`
Expected: FAIL — guards still import `auth` from `@/lib/auth`.

- [ ] **Step 4: Re-point guards**

In `apps/web/lib/auth/guards.ts`, replace `import { auth } from "@/lib/auth"` + `await auth()` with `import { getSession } from "./session"` + `await getSession()`. Logic otherwise unchanged.

- [ ] **Step 5: Re-point the audit actor**

In `apps/web/lib/services/session-service.ts`, change `sessionActorId` to call `getSession()` from `@/lib/auth/session` instead of `auth()`. Keep the try/catch and the `publicId → users.id` lookup.

- [ ] **Step 6: Re-point remaining call sites**

Run: `cd apps/web && git grep -n "from \"@/lib/auth\"\|await auth()"`. For each non-config consumer (e.g. `app/(dashboard)/dashboard/account/page.tsx`), swap `const session = await auth()` → `const session = await getSession()`. Same `session.user.id` / `session.user.role` access.

- [ ] **Step 7: Run guards test + typecheck**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/guards.test.ts && npm run typecheck`
Expected: guards PASS; typecheck clean except the login form (Task 6).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib apps/web/app
git commit -m "feat(auth): getSession helper; re-point guards + audit actor to better-auth"
```

---

### Task 6: Rebuild the login form on the Better Auth client

**Files:**
- Modify: `apps/web/app/(auth)/login/login-form.tsx`
- Test: `apps/web/app/(auth)/login/__tests__/login-form.test.tsx`

**Interfaces:**
- Consumes: `authClient` (`signIn.email`, `signIn.phoneNumber`) from `@/lib/auth/client`.

- [ ] **Step 1: Write the failing render/submit test**

Create `apps/web/app/(auth)/login/__tests__/login-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginForm } from "../login-form";

vi.mock("@/lib/auth/client", () => ({ signIn: { email: vi.fn(), phoneNumber: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

describe("LoginForm", () => {
  it("renders identifier + password fields", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/phone or email/i)).toBeDefined();
    expect(screen.getByLabelText(/^password$/i)).toBeDefined();
  });
});
```

(If `@testing-library/react` + `jsdom` are not yet dev deps, add them and set `environment: "jsdom"` for this test in `vitest.config`. Fold that into this step.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/web && npx vitest run "app/(auth)/login/__tests__/login-form.test.tsx"`
Expected: FAIL — form still imports `next-auth/react`.

- [ ] **Step 3: Rewrite the submit handler**

In `login-form.tsx`, replace `import { signIn } from "next-auth/react"` with `import { signIn } from "@/lib/auth/client"`. Replace `onSubmit` body: detect whether `identifier` looks like an email (`/@/`) → `await signIn.email({ email, password })`, else treat as phone → `await signIn.phoneNumber({ phoneNumber: identifier, password })`. On `error`, set the same generic "Invalid phone/email or password" message; on success `router.push(callbackUrl ?? "/dashboard"); router.refresh();`. Keep all existing JSX/markup and the show-password toggle unchanged.

- [ ] **Step 4: Run the login-form test to confirm it passes**

Run: `cd apps/web && npx vitest run "app/(auth)/login/__tests__/login-form.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(auth)/login
git commit -m "feat(auth): rebuild login form on better-auth client (email + phone)"
```

---

### Task 7: Remove NextAuth, finalize env, full verification

**Files:**
- Modify: `apps/web/package.json` (remove `next-auth`, `@auth/drizzle-adapter`)
- Modify: `apps/web/.env.example` (add Better Auth vars)
- Modify: `apps/web/db/seed-admin.ts` / `db/seed.ts` if they wrote `passwordHash` directly (now write a credential `account` row, or call Better Auth signup)

**Interfaces:**
- Produces: a NextAuth-free build that boots, logs in seeded users, and enforces guards.

- [ ] **Step 1: Uninstall NextAuth**

```bash
cd apps/web && npm uninstall next-auth @auth/drizzle-adapter
```

Run: `cd apps/web && git grep -n "next-auth\|@auth/drizzle-adapter"`
Expected: no matches. Fix any stragglers.

- [ ] **Step 2: Update seeds to the new credential model**

If `db/seed-admin.ts`/`seed.ts` insert `users.passwordHash`, change them to insert the user (no hash) + an `account` row with `providerId="credential"`, `accountId=String(id)`, `password=await hashPassword(...)`. Reuse `toAccountRows` shape from Task 4 where practical.

- [ ] **Step 3: Add env vars**

Add to `apps/web/.env.example`:

```
BETTER_AUTH_SECRET=replace-with-openssl-rand-base64-32
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
```

- [ ] **Step 4: Full test + typecheck + lint + build**

Run: `cd apps/web && npm run typecheck && npx vitest run && npm run lint && npm run build`
Expected: all pass; no references to removed modules.

- [ ] **Step 5: Manual parity check (runbook)**

With a local DB migrated + seeded: start `npm run dev`, sign in as the seeded admin (email + password) → reaches `/dashboard`; confirm a staff-only page renders for `member`, and a customer (`user`) is blocked from it (guard parity). Sign out. Record results in `docs/superpowers/plans/notes/phase0-schema-output.md`.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "chore(auth): remove next-auth; better-auth env + seeds; phase 0 parity verified"
```

---

## Self-Review

- **Spec coverage:** Better Auth + drizzle adapter (T1,T3) · generateId:false / ID boundary (T3) · session/account/verification tables (T2) · password→account + bcrypt verify (T3,T4) · DB sessions + getSession (T3,T5) · guards parity (T5) · role additionalField (T3) · phoneNumber plugin + email-optional (T2,T3) · stubbed reset/verify/OTP callbacks (T3) · login rebuilt (T6) · NextAuth removed (T7). Signup UI / reset UI / profile / PIN are explicitly Phases A–C (separate plans), not Phase 0.
- **Placeholders:** none — every code step carries real code; the one genuinely environment-dependent item (exact user-timestamp reconciliation) is resolved by the Task 1 CLI spike with a documented fallback, not deferred vaguely.
- **Type consistency:** `getSession()` returns `{ user: { id, role } }` consumed by guards (T5) and audit (T5); `betterAuthPassword.{hash,verify}` defined T3 used in config T3; `toAccountRows` signature defined + used T4; `account`/`session`/`verification` exports defined T2 used T3/T4.

## Follow-on plans (not this file)
- **Phase A** — signup (phone+password customer / email staff), logout, password reset/set, email verify (real UI on the stubbed callbacks).
- **Phase B** — profile + avatar (storage abstraction + local stub) + account tabs.
- **Phase C** — 4-digit PIN re-unlock (`/lock`, lockout/backoff).
