# Tiffin Grab — Auth + RBAC + Feature Flags (Subsystem B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single Auth.js v5 login for `admin`/`member`/`user` with database sessions, route-guarded dashboard, normalized per-user feature flags an admin can grant, and audit (`createdBy`/`updatedBy`) stamped from the logged-in user.

**Architecture:** Build on Plan 1's foundation (monorepo, `@tiffin/commons`, `@tiffin/commons-drizzle`, `@tiffin/commons-next`, `apps/web/db/client.ts`, `feature_flags` table). Add Auth.js v5 (`next-auth@beta`) with the Drizzle adapter and a credential→session bridge so the Credentials provider issues real DB sessions. Route protection lives in Next.js 16's `proxy.ts`. A session-aware service base overrides `currentUserId()` so the existing `BaseService`/`UpdatableService` stamp audit fields automatically.

**Tech Stack:** Next.js 16.2.9, Auth.js v5 (`next-auth@beta`), `@auth/drizzle-adapter` ^1.11.2, `bcryptjs` ^3.0.3, Drizzle ORM 0.45, `postgres` 3.4, shadcn/ui (Nova), Vitest 4.1.

## Global Constraints

- Next.js 16 App Router. Route protection uses **`proxy.ts`** (NOT `middleware.ts`) and requires a `proxy`/default export — read `node_modules/next/dist/docs/` (search "proxy") before writing it.
- Read `node_modules/next/dist/docs/` before any framework-specific code (per `AGENTS.md`).
- TypeScript everywhere. No unnecessary comments — document the non-obvious *why* only.
- Use `rg`/`fd` over `grep`/`find`.
- Packages stay **source-only** (`transpilePackages`); no per-package build step.
- Every table uses `baseColumns`/`updatableColumns` from `@tiffin/commons-drizzle`; PKs are uuid v4. Auth.js adapter tables (`accounts`, `sessions`, `verification_tokens`) follow the adapter's required shape and are exempt from the audit-column convention (the adapter owns their lifecycle).
- Auth.js v5 = `next-auth@beta` (npm `latest` is still v4 — do NOT install the unscoped latest). Pin: `@auth/drizzle-adapter@^1.11.2`, `bcryptjs@^3.0.3`.
- Roles come from `@tiffin/commons` `Role` (`admin`/`member`/`user`). The DB enum values must match those string literals exactly.
- Prereq: Plan 1 is fully implemented and its tests pass; the dev Postgres (Postgres.app on `localhost:5432`, `tiffin` db, role `lawbringr`, trust auth) is running and migrated.

---

### Task 1: Install and pin Auth.js v5 dependencies

**Files:**
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `next-auth` (v5 beta), `@auth/drizzle-adapter`, `bcryptjs`, `@types/bcryptjs` available to `apps/web`.

- [ ] **Step 1: Install the auth dependencies**

Run:
```bash
pnpm --filter web add next-auth@beta @auth/drizzle-adapter@^1.11.2 bcryptjs@^3.0.3
pnpm --filter web add -D @types/bcryptjs
```
Expected: `apps/web/package.json` gains `next-auth` (a `5.0.0-beta.x` version), `@auth/drizzle-adapter`, `bcryptjs` in dependencies and `@types/bcryptjs` in devDependencies.

- [ ] **Step 2: Verify the installed next-auth is v5**

Run:
```bash
node -e "console.log(require('./apps/web/node_modules/next-auth/package.json').version)"
```
Expected: prints a `5.0.0-beta.*` version (NOT `4.x`). If it prints `4.x`, re-run with the explicit `@beta` tag.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(auth): add Auth.js v5 (beta), drizzle adapter, bcryptjs"
```

---

### Task 2: Auth + RBAC schema and migration

**Files:**
- Create: `apps/web/db/schema/auth.ts`, `apps/web/db/schema/user-feature-flags.ts`
- Modify: `apps/web/db/schema/index.ts`
- Test: (covered by Task 6 integration test + the migration check below)

**Interfaces:**
- Consumes: `updatableColumns` from `@tiffin/commons-drizzle`; `featureFlags` from `./feature-flags`.
- Produces:
  - `userRole` pgEnum (`admin`,`member`,`user`).
  - `users` (`...updatableColumns`, `name`, `email` unique not null, `emailVerified`, `image`, `passwordHash`, `phone`, `role` default `user`).
  - `accounts`, `sessions`, `verificationTokens` — Auth.js Drizzle adapter shape.
  - `userFeatureFlags` (`...updatableColumns`, `userId`→users, `flagId`→featureFlags, `enabled`; unique(`userId`,`flagId`)).

- [ ] **Step 1: Read the adapter's required schema**

Run:
```bash
rg -n "pgTable|primaryKey|sessionToken|providerAccountId" apps/web/node_modules/@auth/drizzle-adapter/lib/pg.* | head -40
```
Expected: confirms the column names the adapter expects (`sessionToken`, `userId`, `provider`, `providerAccountId`, `identifier`, `token`, `expires`). Match them exactly below.

- [ ] **Step 2: Define the auth schema**

`apps/web/db/schema/auth.ts`:
```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "member", "user"]);

export const users = pgTable("users", {
  ...updatableColumns,
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  role: userRole("role").notNull().default("user"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);
```

`apps/web/db/schema/user-feature-flags.ts`:
```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { featureFlags } from "./feature-flags";
import { users } from "./auth";

export const userFeatureFlags = pgTable(
  "user_feature_flags",
  {
    ...updatableColumns,
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    flagId: uuid("flag_id").notNull().references(() => featureFlags.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [unique("user_feature_flags_user_flag_uq").on(t.userId, t.flagId)],
);
```

- [ ] **Step 3: Export the new tables**

Replace `apps/web/db/schema/index.ts`:
```ts
export * from "./feature-flags";
export * from "./auth";
export * from "./user-feature-flags";
```

- [ ] **Step 4: Generate and run the migration**

Run:
```bash
cd apps/web
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
cd ../..
```
Expected: a new migration under `apps/web/db/migrations/` creating `user_role` enum, `users`, `accounts`, `sessions`, `verification_tokens`, `user_feature_flags`.

- [ ] **Step 5: Verify the tables exist**

Run:
```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h localhost -d tiffin -c "\dt"
```
Expected: lists `users`, `accounts`, `sessions`, `verification_tokens`, `user_feature_flags`, `feature_flags`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/db/schema apps/web/db/migrations
git commit -m "feat(auth): users/accounts/sessions/verification_tokens + user_feature_flags schema"
```

---

### Task 3: bcrypt password hashing utility

**Files:**
- Create: `apps/web/lib/auth/password.ts`
- Test: `apps/web/lib/auth/__tests__/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/auth/__tests__/password.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password hashing", () => {
  it("hashes to a non-plaintext bcrypt string", async () => {
    const hash = await hashPassword("Tiffin123");
    expect(hash).not.toBe("Tiffin123");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
  it("verifies a correct password", async () => {
    const hash = await hashPassword("Tiffin123");
    expect(await verifyPassword("Tiffin123", hash)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Tiffin123");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run lib/auth/__tests__/password.test.ts`
Expected: FAIL — `../password` not found.

- [ ] **Step 3: Implement the utility**

`apps/web/lib/auth/password.ts`:
```ts
import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web exec vitest run lib/auth/__tests__/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/password.ts apps/web/lib/auth/__tests__/password.test.ts
git commit -m "feat(auth): bcrypt password hash/verify utility"
```

---

### Task 4: Auth.js v5 config with the credential→session bridge

**Files:**
- Create: `apps/web/lib/auth/index.ts`, `apps/web/lib/auth/types.ts`
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`
- Modify: `apps/web/.env.example`, `apps/web/.env.local`

**Interfaces:**
- Consumes: `db`, `users`, `accounts`, `sessions`, `verificationTokens` from the app DB; `verifyPassword`; `Role` from `@tiffin/commons`.
- Produces: `auth`, `signIn`, `signOut`, `handlers` exports from `lib/auth`. Session shape: `session.user.id`, `session.user.role`, `session.user.email`.

> **Bridge rationale (the non-obvious why):** Auth.js v5's Credentials provider defaults to JWT sessions and returns null with `strategy: "database"`. The community-proven bridge keeps `strategy: "database"` and overrides `jwt.encode`: when the token came from the credentials provider, it manually creates a `sessions` row via the adapter and returns that `sessionToken` as the cookie value — so the Credentials login issues a real DB session. **Fallback (documented deviation):** if this fights Next 16 at runtime, switch `session.strategy` to `"jwt"` and carry `role` in the token via the `jwt` callback; remove the `jwt.encode` override and the `events.signIn` is unnecessary. Record the switch in the task notes.

- [ ] **Step 1: Add the auth secret to env**

Append to `apps/web/.env.example`:
```
AUTH_SECRET=replace-with-openssl-rand-base64-32
AUTH_URL=http://localhost:3000
```
Run:
```bash
node -e "console.log('AUTH_SECRET='+require('crypto').randomBytes(32).toString('base64'))" >> apps/web/.env.local
echo "AUTH_URL=http://localhost:3000" >> apps/web/.env.local
```
Expected: `apps/web/.env.local` has a real `AUTH_SECRET` and `AUTH_URL`.

- [ ] **Step 2: Declare the session type augmentation**

`apps/web/lib/auth/types.ts`:
```ts
import type { RoleValue } from "@tiffin/commons";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: RoleValue } & DefaultSession["user"];
  }
  interface User {
    role: RoleValue;
  }
}
```

- [ ] **Step 3: Implement the Auth.js config with the bridge**

`apps/web/lib/auth/index.ts`:
```ts
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { Role } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import NextAuth from "next-auth";
import { encode as defaultEncode } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db/client";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { verifyPassword } from "./password";
import "./types";

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "database", maxAge: SESSION_MAX_AGE_S },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const email = String(raw?.email ?? "").toLowerCase().trim();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user?.passwordHash) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role ?? Role.USER };
      },
    }),
  ],
  callbacks: {
    // Tag credentials logins so jwt.encode can mint a DB session for them.
    async jwt({ token, account }) {
      if (account?.provider === "credentials") token.credentials = true;
      return token;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role: typeof Role[keyof typeof Role] }).role;
      }
      return session;
    },
  },
  jwt: {
    // Credential→DB-session bridge: persist a session row, return its token as the cookie.
    encode: async (params) => {
      if (params.token?.credentials) {
        const sessionToken = randomUUID();
        if (!params.token.sub) throw new Error("Missing user id in token");
        const created = await adapter.createSession?.({
          sessionToken,
          userId: params.token.sub,
          expires: new Date(Date.now() + SESSION_MAX_AGE_S * 1000),
        });
        if (!created) throw new Error("Failed to create DB session");
        return sessionToken;
      }
      return defaultEncode(params);
    },
  },
});
```

- [ ] **Step 4: Expose the route handlers**

`apps/web/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors. (A runtime smoke of the bridge happens in Task 8 after the login page + an admin user exist.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/auth apps/web/app/api/auth apps/web/.env.example
git commit -m "feat(auth): Auth.js v5 config + credential->DB-session bridge + route handlers"
```

---

### Task 5: Route protection via `proxy.ts`

**Files:**
- Create: `apps/web/proxy.ts`

**Interfaces:**
- Consumes: `auth` from `lib/auth`.
- Produces: dashboard route guard — unauthenticated requests to `/dashboard/*` redirect to `/login`.

- [ ] **Step 1: Read the Next 16 proxy docs**

Run:
```bash
rg -ln "proxy" apps/web/../../node_modules/next/dist/docs/ 2>/dev/null | head; rg -n "export (default |function )?proxy|proxy.ts" node_modules/next/dist/docs -l | head
```
Expected: confirm the `proxy.ts` file contract (default or `proxy` named export + optional `config.matcher`) before writing it.

- [ ] **Step 2: Implement the guard**

`apps/web/proxy.ts`:
```ts
import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const onDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  if (onDashboard && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

> If Next 16 rejects the default export from `auth(...)`, assign it to a named `proxy` const and `export { proxy }` (and/or `export default proxy`), per the docs read in Step 1. Record which form Next 16 accepted.

- [ ] **Step 3: Verify the app still builds**

Run: `pnpm --filter web exec next build`
Expected: build succeeds; no "middleware.ts is not supported / use proxy.ts" warning.

- [ ] **Step 4: Commit**

```bash
git add apps/web/proxy.ts
git commit -m "feat(auth): proxy.ts guard redirecting unauth /dashboard to /login"
```

---

### Task 6: Feature-flag resolution library

**Files:**
- Create: `apps/web/lib/flags.ts`, `apps/web/components/feature-gate.tsx`
- Test: `apps/web/lib/__tests__/flags.test.ts` (integration; requires the dev DB)

**Interfaces:**
- Consumes: `db`, `featureFlags`, `userFeatureFlags`, `users` from the app DB.
- Produces:
  - `getEffectiveFlags(userId: string): Promise<Record<string, boolean>>` — for each flag, the user's override `enabled` if a `user_feature_flags` row exists, else `feature_flags.defaultEnabled`.
  - `hasFlag(userId: string, key: string): Promise<boolean>`.
  - `<FeatureGate userId flag>` server component that renders children only when the flag is on.

- [ ] **Step 1: Write the failing integration test**

`apps/web/lib/__tests__/flags.test.ts`:
```ts
import { hashPassword } from "@/lib/auth/password";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";
import { getEffectiveFlags, hasFlag } from "../flags";

let userId: string;

async function reset() {
  await db.delete(userFeatureFlags);
  await db.delete(users);
  await db.delete(featureFlags);
}

describe("feature-flag resolution (integration)", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(featureFlags).values([
      { key: "wizard", label: "Wizard", defaultEnabled: true },
      { key: "admin_console", label: "Admin", defaultEnabled: false },
    ]);
    const [u] = await db
      .insert(users)
      .values({ email: "f@x.com", passwordHash: await hashPassword("Tiffin123"), role: "user" })
      .returning();
    userId = u.id;
  });
  afterAll(reset);

  it("returns defaults when the user has no overrides", async () => {
    const flags = await getEffectiveFlags(userId);
    expect(flags).toEqual({ wizard: true, admin_console: false });
  });

  it("applies a per-user override over the default", async () => {
    const [adminFlag] = await db.select().from(featureFlags).where(eq(featureFlags.key, "admin_console"));
    await db.insert(userFeatureFlags).values({ userId, flagId: adminFlag.id, enabled: true });
    expect(await hasFlag(userId, "admin_console")).toBe(true);
    expect(await hasFlag(userId, "wizard")).toBe(true);
  });
});

import { eq } from "drizzle-orm";
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run lib/__tests__/flags.test.ts`
Expected: FAIL — `../flags` not found.

- [ ] **Step 3: Implement the resolution library**

`apps/web/lib/flags.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags } from "@/db/schema";

export async function getEffectiveFlags(userId: string): Promise<Record<string, boolean>> {
  const flags = await db.select().from(featureFlags);
  const overrides = await db
    .select()
    .from(userFeatureFlags)
    .where(eq(userFeatureFlags.userId, userId));

  const overrideByFlagId = new Map(overrides.map((o) => [o.flagId, o.enabled]));
  const result: Record<string, boolean> = {};
  for (const flag of flags) {
    result[flag.key] = overrideByFlagId.has(flag.id)
      ? Boolean(overrideByFlagId.get(flag.id))
      : flag.defaultEnabled;
  }
  return result;
}

export async function hasFlag(userId: string, key: string): Promise<boolean> {
  const flags = await getEffectiveFlags(userId);
  return flags[key] ?? false;
}
```

`apps/web/components/feature-gate.tsx`:
```tsx
import type { ReactNode } from "react";
import { hasFlag } from "@/lib/flags";

export async function FeatureGate({
  userId,
  flag,
  children,
}: {
  userId: string;
  flag: string;
  children: ReactNode;
}) {
  const enabled = await hasFlag(userId, flag);
  return enabled ? <>{children}</> : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web exec vitest run lib/__tests__/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/flags.ts apps/web/components/feature-gate.tsx apps/web/lib/__tests__/flags.test.ts
git commit -m "feat(flags): effective-flag resolution + FeatureGate"
```

---

### Task 7: Session-aware service base (audit stamping from the session)

**Files:**
- Create: `apps/web/lib/services/session-service.ts`
- Modify: `apps/web/lib/services/feature-flags.service.ts`

**Interfaces:**
- Consumes: `BaseService`, `UpdatableService` from `@tiffin/commons-drizzle`; `auth` from `lib/auth`.
- Produces: `SessionBaseService`, `SessionUpdatableService` — override `currentUserId()` to read the Auth.js session, so `create`/`update` stamp `createdBy`/`updatedBy` automatically.

- [ ] **Step 1: Implement the session-aware bases**

`apps/web/lib/services/session-service.ts`:
```ts
import { BaseService, UpdatableService } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import { auth } from "@/lib/auth";

async function sessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export class SessionBaseService<TTable extends PgTable> extends BaseService<TTable> {
  protected currentUserId(): Promise<string | null> {
    return sessionUserId();
  }
}

export class SessionUpdatableService<TTable extends PgTable> extends UpdatableService<TTable> {
  protected currentUserId(): Promise<string | null> {
    return sessionUserId();
  }
}
```

- [ ] **Step 2: Switch the feature-flags service to the session-aware base**

Replace `apps/web/lib/services/feature-flags.service.ts`:
```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { featureFlags } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

const repo = new UpdatableRepository(db, featureFlags, featureFlags.id);
export const featureFlagsService = new SessionUpdatableService(repo);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors. The existing `/api/feature-flags` routes (Plan 1) keep working; mutations now stamp the logged-in admin as `createdBy`/`updatedBy`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/services
git commit -m "feat(services): session-aware service base stamps audit from Auth.js session"
```

---

### Task 8: `/login` page with shadcn form + bridge smoke test

**Files:**
- Create: `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/login/login-form.tsx`
- Create: `apps/web/db/seed-admin.ts`
- Add shadcn components: `form`, `input`, `button`, `card`, `label`
- Modify: `apps/web/package.json` (deps for shadcn form: `react-hook-form`, `@hookform/resolvers`, `zod`)

**Interfaces:**
- Consumes: `signIn` from `lib/auth`; `hashPassword`.
- Produces: a working credentials login that lands an authenticated session; a seeded admin user.

- [ ] **Step 1: Add the shadcn form components**

Run:
```bash
cd apps/web
npx -y shadcn@latest add form input button card label
cd ../..
```
Expected: `apps/web/components/ui/{form,input,button,card,label}.tsx` created; `react-hook-form`, `@hookform/resolvers`, `zod` added to `apps/web/package.json`.

> Use the **shadcn MCP server** (`shadcn` tools) to confirm the current Form/Input/Button/Card/Label component APIs before wiring them — the generated files are the source of truth for prop names.

- [ ] **Step 2: Seed an initial admin user (idempotent)**

`apps/web/db/seed-admin.ts`:
```ts
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { db } from "./client";
import { users } from "./schema";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@tiffingrab.ca";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (existing) {
    console.log(`Admin already exists: ${ADMIN_EMAIL}`);
    process.exit(0);
  }
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    name: "Tiffin Admin",
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role: "admin",
  });
  console.log(`Seeded admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add to `apps/web/package.json` scripts: `"db:seed:admin": "tsx db/seed-admin.ts"`. Run:
```bash
pnpm --filter web db:seed:admin
```
Expected: `Seeded admin: admin@tiffingrab.ca / Admin123!`.

- [ ] **Step 3: Build the login form (client) calling signIn**

`apps/web/app/(auth)/login/login-form.tsx`:
```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setError(null);
    const res = await signIn("credentials", { ...values, redirect: false });
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </Form>
  );
}
```

`apps/web/app/(auth)/login/page.tsx`:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Tiffin Grab</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Smoke-test the credential→DB-session bridge end-to-end**

Run (DB up + admin seeded):
```bash
pnpm --filter web dev &
sleep 6
# 1) confirm a session row count baseline
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h localhost -d tiffin -t -c "select count(*) from sessions;"
echo "Now sign in via the browser at http://localhost:3000/login with admin@tiffingrab.ca / Admin123!"
echo "Then re-run the count below; it must increase by 1 (DB session created by the bridge)."
kill %1
```
Expected: after a successful browser login, `select count(*) from sessions;` increases by 1 and the app redirects to `/dashboard` (then to the page or a not-yet-built 404 — acceptable here; Task 10 builds it). If the count does NOT increase or the session is null, invoke the **JWT fallback** from Task 4's rationale and re-test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(auth\) apps/web/components/ui apps/web/db/seed-admin.ts apps/web/package.json
git commit -m "feat(auth): /login shadcn form + admin seed + DB-session bridge smoke"
```

---

### Task 9: Users REST resource + user-feature-flags service

**Files:**
- Create: `apps/web/lib/services/users.service.ts`, `apps/web/lib/services/user-feature-flags.service.ts`
- Create: `apps/web/lib/auth/guards.ts`
- Create: `apps/web/app/api/users/route.ts`, `apps/web/app/api/users/[id]/route.ts`, `apps/web/app/api/users/query/route.ts`
- Test: `apps/web/lib/services/__tests__/user-feature-flags.service.test.ts` (integration)

**Interfaces:**
- Consumes: `UpdatableRepository`, `SessionUpdatableService`; `createCollectionRoute`/`createResourceRoute`/`createQueryRoute` from `@tiffin/commons-next`; `auth`, `Role`.
- Produces:
  - `usersService` (SessionUpdatableService over `users`).
  - `userFeatureFlagsService.setFlag(userId, flagId, enabled): Promise<void>` — upsert into `user_feature_flags`.
  - `requireAdmin(req): Promise<void>` guard — throws `AuthError`/`ForbiddenError`.
  - `/api/users` collection + `/api/users/[id]` (PATCH role) + `/api/users/query`, all admin-guarded.

- [ ] **Step 1: Implement the admin guard**

`apps/web/lib/auth/guards.ts`:
```ts
import { AuthError, ForbiddenError, Role } from "@tiffin/commons";
import { auth } from "@/lib/auth";

export async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new AuthError();
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();
}
```

> `@tiffin/commons-next` route options take `guard?: (req: Request) => Promise<void>`. Wrap `requireAdmin` as `() => requireAdmin()` when passing it, since the session is read from cookies, not the request argument.

- [ ] **Step 2: Implement the users service + REST routes**

`apps/web/lib/services/users.service.ts`:
```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

const repo = new UpdatableRepository(db, users, users.id);
export const usersService = new SessionUpdatableService(repo);
```

`apps/web/app/api/users/route.ts`:
```ts
import { createCollectionRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";

export const { GET, POST } = createCollectionRoute(usersService, { guard: () => requireAdmin() });
```

`apps/web/app/api/users/[id]/route.ts`:
```ts
import { createResourceRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(usersService, { guard: () => requireAdmin() });
```

`apps/web/app/api/users/query/route.ts`:
```ts
import { createQueryRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";

export const { POST } = createQueryRoute(usersService, { guard: () => requireAdmin() });
```

- [ ] **Step 3: Write the failing user-feature-flags service test**

`apps/web/lib/services/__tests__/user-feature-flags.service.test.ts`:
```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";
import { userFeatureFlagsService } from "../user-feature-flags.service";

let userId: string;
let flagId: string;

async function reset() {
  await db.delete(userFeatureFlags);
  await db.delete(users);
  await db.delete(featureFlags);
}

describe("userFeatureFlagsService.setFlag (integration)", () => {
  beforeEach(async () => {
    await reset();
    const [u] = await db.insert(users).values({ email: "uff@x.com", role: "user" }).returning();
    const [f] = await db.insert(featureFlags).values({ key: "k", label: "K", defaultEnabled: false }).returning();
    userId = u.id;
    flagId = f.id;
  });
  afterAll(reset);

  it("inserts an override on first set", async () => {
    await userFeatureFlagsService.setFlag(userId, flagId, true);
    const [row] = await db.select().from(userFeatureFlags).where(eq(userFeatureFlags.userId, userId));
    expect(row.enabled).toBe(true);
  });

  it("updates the override on a second set (no duplicate row)", async () => {
    await userFeatureFlagsService.setFlag(userId, flagId, true);
    await userFeatureFlagsService.setFlag(userId, flagId, false);
    const rows = await db.select().from(userFeatureFlags).where(eq(userFeatureFlags.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/user-feature-flags.service.test.ts`
Expected: FAIL — `../user-feature-flags.service` not found.

- [ ] **Step 5: Implement the user-feature-flags service (upsert)**

`apps/web/lib/services/user-feature-flags.service.ts`:
```ts
import { db } from "@/db/client";
import { userFeatureFlags } from "@/db/schema";

export const userFeatureFlagsService = {
  async setFlag(userId: string, flagId: string, enabled: boolean): Promise<void> {
    await db
      .insert(userFeatureFlags)
      .values({ userId, flagId, enabled })
      .onConflictDoUpdate({
        target: [userFeatureFlags.userId, userFeatureFlags.flagId],
        set: { enabled, updatedAt: new Date() },
      });
  },
};
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/user-feature-flags.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/services apps/web/lib/auth/guards.ts apps/web/app/api/users
git commit -m "feat(admin): users REST resource (admin-guarded) + user-feature-flags upsert service"
```

---

### Task 10: Admin `/dashboard/users` UI — roles + per-user flags

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/layout.tsx`, `apps/web/app/(dashboard)/dashboard/users/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/users/actions.ts`, `apps/web/app/(dashboard)/dashboard/users/user-row.tsx`
- Add shadcn components: `table`, `select`, `switch`

**Interfaces:**
- Consumes: `auth`, `requireAdmin`-equivalent layout check; `usersService`, `userFeatureFlagsService`, `getEffectiveFlags`; `db`/`featureFlags`.
- Produces: an admin-only page listing users, with a role selector (PATCH `/api/users/[id]`) and a per-user flag toggle (server action → `userFeatureFlagsService.setFlag`).

- [ ] **Step 1: Add shadcn components**

Run:
```bash
cd apps/web
npx -y shadcn@latest add table select switch
cd ../..
```
Expected: `apps/web/components/ui/{table,select,switch}.tsx` created.

- [ ] **Step 2: Admin-guarded dashboard layout**

`apps/web/app/(dashboard)/dashboard/layout.tsx`:
```tsx
import { Role } from "@tiffin/commons";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) {
    redirect("/");
  }
  return <div className="mx-auto max-w-5xl p-6">{children}</div>;
}
```

- [ ] **Step 3: Server actions for role change + flag toggle**

`apps/web/app/(dashboard)/dashboard/users/actions.ts`:
```ts
"use server";

import type { RoleValue } from "@tiffin/commons";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { userFeatureFlagsService } from "@/lib/services/user-feature-flags.service";
import { usersService } from "@/lib/services/users.service";

export async function setUserRole(userId: string, role: RoleValue) {
  await requireAdmin();
  await usersService.update(userId, { role });
  revalidatePath("/dashboard/users");
}

export async function setUserFlag(userId: string, flagId: string, enabled: boolean) {
  await requireAdmin();
  await userFeatureFlagsService.setFlag(userId, flagId, enabled);
  revalidatePath("/dashboard/users");
}
```

- [ ] **Step 4: User row (client) — role select + flag switches**

`apps/web/app/(dashboard)/dashboard/users/user-row.tsx`:
```tsx
"use client";

import { Role, type RoleValue } from "@tiffin/commons";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { setUserFlag, setUserRole } from "./actions";

type FlagState = { id: string; key: string; label: string; enabled: boolean };

export function UserRow({
  user,
  flags,
}: {
  user: { id: string; email: string; role: RoleValue };
  flags: FlagState[];
}) {
  const [pending, start] = useTransition();
  return (
    <TableRow>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <Select
          defaultValue={user.role}
          onValueChange={(v) => start(() => setUserRole(user.id, v as RoleValue))}
          disabled={pending}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.values(Role).map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-3">
          {flags.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <Switch
                checked={f.enabled}
                onCheckedChange={(c) => start(() => setUserFlag(user.id, f.id, c))}
                disabled={pending}
              />
              {f.label}
            </label>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 5: Users page (server) — load users, flags, effective state**

`apps/web/app/(dashboard)/dashboard/users/page.tsx`:
```tsx
import { db } from "@/db/client";
import { featureFlags, users } from "@/db/schema";
import { getEffectiveFlags } from "@/lib/flags";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserRow } from "./user-row";

export default async function UsersPage() {
  const [allUsers, allFlags] = await Promise.all([
    db.select().from(users),
    db.select().from(featureFlags),
  ]);

  const rows = await Promise.all(
    allUsers.map(async (u) => {
      const effective = await getEffectiveFlags(u.id);
      return {
        user: { id: u.id, email: u.email, role: u.role },
        flags: allFlags.map((f) => ({ id: f.id, key: f.key, label: f.label, enabled: effective[f.key] ?? false })),
      };
    }),
  );

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">Users</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Feature flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <UserRow key={r.user.id} user={r.user} flags={r.flags} />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
```

- [ ] **Step 6: Manual end-to-end verification**

Run (DB up, admin seeded, plus seed a non-admin user via `pnpm --filter web db:seed:admin` env overrides or the wizard later):
```bash
pnpm --filter web dev &
sleep 6
echo "Sign in at http://localhost:3000/login as admin@tiffingrab.ca / Admin123!"
echo "Visit http://localhost:3000/dashboard/users"
echo "Verify: users listed; changing a role persists (refresh); toggling a flag persists."
echo "Verify: signing out and hitting /dashboard/users redirects to /login (proxy guard)."
kill %1
```
Expected: role changes and flag toggles persist across refresh; unauth access to `/dashboard/users` redirects to `/login`; a non-admin lands a redirect to `/`.

- [ ] **Step 7: Typecheck, lint, commit**

Run:
```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
git add apps/web/app/\(dashboard\) apps/web/components/ui
git commit -m "feat(admin): /dashboard/users — role management + per-user feature-flag toggles"
```

---

## Self-Review

**Spec §6 coverage:**
- `/login` shadcn form, Credentials validating `users.passwordHash` (bcrypt) → Tasks 3, 4, 8. ✅
- Database sessions via credential→session bridge + documented JWT fallback → Task 4 (bridge), Task 8 (smoke). ✅
- Route protection in `proxy.ts` guarding `/dashboard/*`; admin subtree checked in server layout → Tasks 5, 10. ✅
- `lib/flags.ts` `getEffectiveFlags`/`hasFlag` + `<FeatureGate>` → Task 6. ✅
- Admin UI `/dashboard/users` → change role, toggle per-user catalog flags (writes `user_feature_flags`) → Tasks 9, 10. ✅
- Normalized data model (`users`, adapter tables, `user_feature_flags` unique(userId,flagId)) → Task 2. ✅
- Audit `createdBy`/`updatedBy` stamped from the session (`currentUserId` override) → Task 7. ✅
- Seed initial admin (idempotent) → Task 8 Step 2. ✅

**Spec §9 coverage (auth-relevant):** bcrypt roundtrip test (Task 3), effective-flag resolution override-vs-default test (Task 6), credential→session-bridge smoke (Task 8), user-feature-flags upsert test (Task 9). ✅

**Placeholder scan:** none — every code step shows complete code; every run step gives the exact command + expected result. UI tasks use explicit manual-verification checklists (consistent with Plan 1 Task 5), since browser-driven auth flows aren't unit-testable here.

**Type consistency:** `hashPassword`/`verifyPassword`, `getEffectiveFlags`/`hasFlag`, `SessionBaseService`/`SessionUpdatableService` (`currentUserId` override matching the `@tiffin/commons-drizzle` `protected currentUserId(): Promise<string|null>` signature), `usersService`/`userFeatureFlagsService.setFlag`, `requireAdmin`, `Role`/`RoleValue` used consistently across Tasks 3–10. `createCollectionRoute`/`createResourceRoute`/`createQueryRoute` and their `guard` option match Plan 1's `@tiffin/commons-next` interface.

**Known risk carried forward:** the credential→DB-session bridge (Task 4) is the one runtime-risk area on Next 16; Task 8's smoke test is the gate, with the JWT fallback pre-documented so the executor can pivot without re-planning.

## Note on the next plan
- **Plan 3 — Subscription wizard + checkout (C):** catalog tables + seed, pricing engine (Vitest), 4-step wizard, 2-step checkout (postal-zone match + waitlist), activation + auto-provision (reuses `hashPassword` + temp password `Tiffin123` from this plan), and a `subscriptions`/`payments` data model. Auth from this plan supplies the session that auto-provisioning logs the new customer into.
