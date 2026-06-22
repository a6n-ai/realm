# Phase 0 — Better Auth Schema Output & Reconciliation Plan

Generated: 2026-06-22  
Better Auth version: **1.6.20**  
CLI command that worked: `pnpm dlx @better-auth/cli@latest generate --config lib/auth/better-auth.config.ts --output /tmp/better-auth-schema.ts -y`  
(Note: `npx @better-auth/cli@latest` required a separate permission allowance; `pnpm dlx` was used instead and produced identical output.)

---

## 1. Generated Schema (verbatim from `/tmp/better-auth-schema.ts`)

```ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Relations omitted for brevity — standard one-to-many user→sessions, user→accounts
```

---

## 2. `user` Table — Column-by-Column Reconciliation

Better Auth's expected `user` columns vs. the existing `users` table (which uses `updatableColumns("usr")` = bigint `id` + `public_id` + epoch-ms `created_at`/`updated_at` + `created_by`/`updated_by`):

| BA column | BA type | Existing column | Existing type | Disposition |
|---|---|---|---|---|
| `id` | `text` PK | `id` | `bigint` PK (`next_id()`) | **CONFLICT** — see §4 |
| `name` | `text NOT NULL` | `name` | `text` (nullable) | Map as-is; BA model field `fields.name` → `name`. NOT NULL constraint is new. |
| `email` | `text NOT NULL UNIQUE` | `email` | `text` nullable with conditional unique index | Add `NOT NULL`; replace conditional unique with plain unique. |
| `emailVerified` | `boolean NOT NULL default false` | `email_verified` | `timestamp with timezone` (unused) | **CONVERT**: drop timestamp column, add `boolean email_verified NOT NULL DEFAULT false`. Migration required. |
| `image` | `text` | `image` | `text` | Map as-is — identical. |
| `createdAt` | `timestamp NOT NULL defaultNow()` | `created_at` | `bigint` (epoch-ms) | **TYPE MISMATCH** — see §3. |
| `updatedAt` | `timestamp NOT NULL defaultNow()` | `updated_at` | `bigint` (epoch-ms) | **TYPE MISMATCH** — see §3. |
| `phoneNumber` | `text UNIQUE` | `phone` | `text` with conditional unique | Rename `phone` → `phone_number` OR use field mapping in BA config: `fields: { phoneNumber: "phone" }`. |
| `phoneNumberVerified` | `boolean` | _(absent)_ | — | Add new column `phone_number_verified boolean`. |
| _(absent)_ | — | `public_id` | `text NOT NULL UNIQUE` | Keep; not a BA concern. |
| _(absent)_ | — | `password_hash` | `text` | Keep; BA uses `account.password` for credentials, but we may retain `password_hash` on `users` for migration period. |
| _(absent)_ | — | `role` | `user_role` enum | Keep; not a BA concern. |
| _(absent)_ | — | `created_by` / `updated_by` | `bigint` | Keep; not a BA concern. |

### Table name conflict
Better Auth defaults to the table name `"user"` (singular). The existing table is `"users"` (plural). The drizzle adapter `schema: { user: users }` option in the config maps BA's logical `user` model to the existing `users` table — this is already handled in the temp config.

---

## 3. `createdAt`/`updatedAt` Type Compatibility

The existing `users.created_at` / `users.updated_at` are `bigint` columns storing epoch-ms (via `{ mode: "number" }`). Better Auth internally calls `new Date()` and compares timestamps as JS `Date` objects. The drizzle adapter will call Drizzle ORM's column serialiser when writing, and deserialiser when reading.

**Risk:** `bigint mode:"number"` columns do NOT transparently accept `Date` objects from Better Auth's internals — the adapter passes a `Date` and Postgres expects an integer. Drizzle-ORM's `bigint` column does not auto-coerce `Date → epoch-ms`.

**Two documented paths for Task 2:**

**Path A (preferred, if probe confirms):** Map BA's `createdAt`/`updatedAt` model fields to the existing bigint columns using the adapter's `fields` option and a custom serialiser. Requires confirming the drizzle adapter supports a `transform` or `customType` shim. This preserves the house convention exactly.

**Path B (safe fallback):** Add two new `timestamp` columns — `bauth_created_at timestamp NOT NULL defaultNow()` and `bauth_updated_at timestamp NOT NULL` — and point BA's field mapping at them, keeping the existing bigint `created_at`/`updated_at` for internal code. This is the zero-risk path and avoids adapter hacking.

**Recommendation:** Start Task 2 with Path B (new timestamp columns, separate from bigint epoch-ms columns) to unblock the migration without risking adapter breakage. If the team later decides epoch-ms columns are sufficient, that's a follow-up cleanup, not a blocker.

---

## 4. `session` / `account` / `verification` — House Convention Probe

### The question
These tables should follow the repo convention: bigint `id` (PK, `next_id()` default), `public_id` text, epoch-ms `created_at`/`updated_at`. Better Auth treats the `id` on these tables as a string internally (it generates UUIDs/nanoid by default via `generateId`). A bigint PK exceeds JS safe-int, so reading it back as a JS string like `"12345678901234"` still works as a string comparison — but the adapter must not coerce it to `number`.

### Probe verdict: **DEFERRED — DB not available in this environment**

`DATABASE_URL` was not set / reachable during this spike. A live sign-in test could not be executed.

**Theoretical risk (documented for Task 2 decision):**

1. Better Auth's `session` lookup by `token` (not by `id`) — the `id` is only used for `deleteById` operations. If the adapter issues `WHERE id = $1` with the bigint string value and Postgres accepts the string-to-bigint implicit cast, lookups work.
2. The drizzle adapter calls `db.insert(session).values({ id: generateId(), ... })`. If `generateId` returns a nanoid string and the column is `bigint`, the insert will fail with a type error. With `generateId: false` in the BA config and the column defaulting to `next_id()`, BA passes `undefined` for `id` and Postgres generates it — this is the intended path.
3. When BA reads the session back, it serialises `id` as whatever Drizzle returns for a `bigint mode:"bigint"` column — a JS `BigInt`. BA then compares session IDs as strings in cookie matching. `BigInt.toString()` produces the correct decimal string, so cookie lookup likely works — **but this is unverified**.

**Recommendation:**

For Task 2, take the **conservative path**: use Better Auth's default `text id` PK for `session`, `account`, and `verification`, but still add `public_id text NOT NULL UNIQUE` + epoch-ms `created_at`/`updated_at` bigint columns (beside BA's own `timestamp created_at`/`updated_at`) to satisfy house conventions everywhere except the PK type. This is Path B from the brief:

> Keep Better Auth's text `id` PK, but still add `public_id` + epoch-ms `created_at`/`updated_at` so the tables match house conventions everywhere except the PK type.

**Mark: DEFERRED TO EXECUTION — must be confirmed when a DB is available before Task 2 finalises the PK type.**

If the team wants to attempt bigint PK on these tables, the test is: set `generateId: false`, define `id: bigint("id").primaryKey().default(sql\`next_id()\`)`, run a sign-in, and verify session cookie lookup succeeds. Record the result and update this document.

---

## 5. Full Table Definitions Required (for Task 2 schema author)

### `session`
Required BA fields: `id`, `expiresAt`, `token` (unique), `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, `userId` (FK → users.id).  
House additions: `public_id text NOT NULL UNIQUE`, epoch-ms `bauth_created_at` / `bauth_updated_at` (or use the BA timestamps as the canonical ones).

### `account`
Required BA fields: `id`, `accountId`, `providerId`, `userId` (FK), `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt`.  
Note: `password` here stores the hashed credential for email/password auth — distinct from `users.password_hash`. Plan for dedup in Task 3.  
House additions: `public_id`.

### `verification`
Required BA fields: `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`.  
House additions: `public_id`.

---

## 6. Confirmed Import Paths (verified against `better-auth@1.6.20` package.json exports)

| Symbol | Import path |
|---|---|
| `betterAuth` | `better-auth` |
| `drizzleAdapter` | `better-auth/adapters/drizzle` |
| `phoneNumber` (server plugin) | `better-auth/plugins` |
| `toNextJsHandler` | `better-auth/next-js` |
| `nextCookies` | `better-auth/next-js` |
| `createAuthClient` (React) | `better-auth/react` |
| `phoneNumberClient` (React client plugin) | `better-auth/client/plugins` |

All paths above exist as named exports in the installed `better-auth@1.6.20` package. Verified by inspecting `package.json#exports` and type declaration files.

---

## 7. Existing NextAuth Tables — What Happens to Them

The existing `auth.ts` schema has:
- `users` — the main user table (kept, mapped to BA's `user` model)
- `accounts` — NextAuth OAuth accounts (plural, different schema from BA's `account`)
- `sessions` — NextAuth sessions (plural, different from BA's `session`)
- `verificationTokens` — NextAuth tokens (different from BA's `verification`)

Task 2 will create **new** tables (`session`, `account`, `verification` singular) alongside the existing plural NextAuth tables. The NextAuth tables remain until the migration is complete and NextAuth is removed (a later task). No existing table is dropped in Task 1 or Task 2.

---

## 8. CLI Invocation That Worked

```bash
cd apps/web
pnpm dlx @better-auth/cli@latest generate \
  --config lib/auth/better-auth.config.ts \
  --output /tmp/better-auth-schema.ts \
  -y
```

The CLI issued a `WARN` about `BASE_URL` not being set — this is expected for a non-running config and did not affect schema generation. Schema was generated successfully.

The `@better-auth/cli` package is a separate package (not a binary bundled in `better-auth` itself). It must be run via `pnpm dlx` or `npx`.
