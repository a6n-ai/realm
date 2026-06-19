# Dual-ID (snowflake bigint + prefixed nanoid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every UUID primary key with a dual-id scheme — an internal snowflake `bigint` (the PK and every FK target) plus a public 3-letter-prefixed 12-char nanoid (`public_id`) for all external surfaces — and store all domain timestamps as epoch milliseconds.

**Architecture:** A factory in `@tiffin/commons-drizzle` mints the shared columns per table given its 3-letter prefix: a `bigint id` defaulted by a Postgres `next_id()` snowflake function, a `public_id` text nanoid generated app-side, and epoch-ms `bigint` `created_at`/`updated_at`. FKs reference the internal `bigint id`; clients only ever see/pass `public_id`, which services resolve to the internal id at the boundary. The migration baseline is reset (no prod data); the dev DB is dropped, recreated, reseeded.

**Tech Stack:** Next.js 16, Drizzle/Postgres, Auth.js v5 (JWT + DrizzleAdapter), Vitest, `nanoid`.

## Global Constraints

- **Dual id, every domain table:** internal `id` = `bigint("id",{mode:"bigint"}).primaryKey().default(sql\`next_id()\`)`; `public_id` = `text("public_id").notNull().unique()` app-generated `<prefix>_<nanoid(12)>`. **Prefix is always exactly 3 lowercase letters.**
- **FKs reference internal `bigint id`**, declared `bigint("x_id",{mode:"bigint"}).references(() => table.id, …)`. Keep existing `onDelete`/nullability per the inventory.
- **64-bit safety:** all bigint id/FK columns use `mode:"bigint"` (JS `BigInt`). The internal id is NEVER serialized to client/JSON/JWT. Only `public_id` crosses the wire.
- **Timestamps = epoch ms:** domain timestamps are `bigint("col",{mode:"number"})`, default `Date.now()`; `updated_at` also `$onUpdate(() => Date.now())`. **Auth-adapter carve-out (do NOT convert):** `users.email_verified`, `sessions.expires`, `verification_tokens.expires` stay `timestamp(..,{withTimezone:true})`; `accounts.expires_at` stays `integer` (OAuth epoch seconds).
- **Epoch in / epoch out, format only in UI:** the DB stores and the server/API/loaders/services **return raw UTC epoch ms** (a `number`) — never a formatted or timezone-shifted string. Conversion to a human-readable, client-local string happens **only in client UI components**, through the single shared converter (`apps/web/lib/format/datetime.ts`, Task 5) which uses the client's own timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). No server component or service formats a date.
- **Auth.js:** `users.id` stays internal bigint; `users.public_id` = `usr_…`; jwt/session callbacks set `session.user.id = public_id`.
- **Snowflake:** `next_id()` plpgsql + `id_seq` sequence; layout `41 bits ms-epoch | 13 bits shard | 10 bits seq`; custom epoch `1735689600000` (2025-01-01Z); `shard_id = 1`.
- **Migration:** reset baseline — delete all `apps/web/db/migrations/*` + `meta/*`, regenerate one baseline, prepend the `id_seq`+`next_id()` SQL, drop+recreate dev DB, migrate, reseed.
- **DB commands:** prefix `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"` on every drizzle-kit/tsx/vitest/build command. drizzle from `apps/web`.
- **TRANSIENT RED:** retyping shared id/timestamp columns breaks compilation repo-wide. The full `pnpm test && pnpm typecheck && pnpm build` green gate applies only at **Task 11**. For Tasks 1–10, "verify" means the scoped checks named in that task (targeted unit tests + `pnpm --filter <pkg> exec tsc --noEmit` on packages that CAN compile). Reviewers: do not reject Tasks 2–10 for repo-wide red; judge against the task's named scoped checks. (Task 5, the UI converter, is self-contained and fully green on its own.)
- **Vitest + session services:** any test importing a service that transitively imports `@/lib/auth` must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` then `await import(...)`.
- **Prefix map:** `usr` users · `flg` feature_flags · `uff` user_feature_flags · `pln` plans · `msz` meal_sizes · `adn` addons · `frq` delivery_frequencies · `dur` duration_packages · `zon` delivery_zones · `ord` orders · `pay` payments · `inq` inquiries · `iac` inquiry_activities · `slt` meal_slots · `dsh` dishes · `mnw` menu_weeks · `mni` menu_items · `msl` meal_selections. (`accounts`/`sessions`/`verification_tokens` are adapter-managed composite/token PKs — no factory id, no `public_id`.)
- **TypeScript only, no unnecessary comments. Plain commits, NO `Co-Authored-By`.** Commit test files explicitly.

---

## Phase 1 — Foundation (schema, factory, migration). Tree goes red here.

### Task 1: `nanoid` dep + id factory in `@tiffin/commons-drizzle`

**Files:**
- Modify: `packages/commons-drizzle/package.json` (add `nanoid`)
- Modify: `packages/commons-drizzle/src/columns.ts`
- Test: `packages/commons-drizzle/src/columns.test.ts` (create)

**Interfaces:**
- Produces: `baseColumns(prefix: string)` and `updatableColumns(prefix: string)` returning the shared column set; `makePublicId(prefix: string): () => string` (the nanoid generator). Consumed by every schema file (Task 2) and tests.

- [ ] **Step 1: Add dependency** — in `apps/web` workspace root run:
  `pnpm --filter @tiffin/commons-drizzle add nanoid`
  Expected: `nanoid` appears in `packages/commons-drizzle/package.json` dependencies.

- [ ] **Step 2: Write the failing test** — `packages/commons-drizzle/src/columns.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { makePublicId } from "./columns";

describe("makePublicId", () => {
  it("produces <prefix>_<12-char nanoid>", () => {
    const gen = makePublicId("usr");
    const id = gen();
    expect(id).toMatch(/^usr_[A-Za-z0-9_-]{12}$/);
  });

  it("generates unique values", () => {
    const gen = makePublicId("ord");
    const ids = new Set(Array.from({ length: 1000 }, () => gen()));
    expect(ids.size).toBe(1000);
  });

  it("rejects a non-3-letter prefix", () => {
    expect(() => makePublicId("user")).toThrow();
    expect(() => makePublicId("us")).toThrow();
  });
});
```

- [ ] **Step 3: Run — fails** — `pnpm --filter @tiffin/commons-drizzle exec vitest run src/columns.test.ts` → FAIL (`makePublicId` not exported).

- [ ] **Step 4: Implement** — replace `packages/commons-drizzle/src/columns.ts` with:

```ts
import { sql } from "drizzle-orm";
import { bigint, text, timestamp } from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
const nano = customAlphabet(ALPHABET, 12);

export function makePublicId(prefix: string): () => string {
  if (!/^[a-z]{3}$/.test(prefix)) {
    throw new Error(`id prefix must be exactly 3 lowercase letters, got "${prefix}"`);
  }
  return () => `${prefix}_${nano()}`;
}

export function baseColumns(prefix: string) {
  return {
    id: bigint("id", { mode: "bigint" }).primaryKey().default(sql`next_id()`),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId(prefix)),
    createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    createdBy: bigint("created_by", { mode: "bigint" }),
  };
}

export function updatableColumns(prefix: string) {
  return {
    ...baseColumns(prefix),
    updatedAt: bigint("updated_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdate(() => Date.now()),
    updatedBy: bigint("updated_by", { mode: "bigint" }),
  };
}
```

- [ ] **Step 5: Run — passes** — `pnpm --filter @tiffin/commons-drizzle exec vitest run src/columns.test.ts` → PASS.

- [ ] **Step 6: Fix the package's own type usages** — `condition.test.ts:7` uses `uuid("id")`. Change to `import { bigint } from "drizzle-orm/pg-core"` and `id: bigint("id",{mode:"bigint"}).primaryKey()`. Run `pnpm --filter @tiffin/commons-drizzle exec tsc --noEmit` → clean, and `pnpm --filter @tiffin/commons-drizzle test` → all green.

- [ ] **Step 7: Commit**

```bash
git add packages/commons-drizzle
git commit -m "feat(commons-drizzle): prefixed-nanoid + snowflake/epoch column factory"
```

**Scoped verify (transient red elsewhere is expected):** `@tiffin/commons-drizzle` typecheck + tests green.

---

### Task 2: Rewrite all schema files (factory(prefix), bigint FKs, epoch timestamps)

**Files (modify):** `apps/web/db/schema/{auth,catalog,orders,inquiries,feature-flags,user-feature-flags,menu}.ts`

**Interfaces:**
- Consumes: `baseColumns(prefix)`/`updatableColumns(prefix)` from Task 1.
- Produces: every table now has `id: bigint`, `public_id: text unique`; all FK columns are `bigint mode:"bigint"`; domain timestamps are `bigint mode:"number"`.

**Transformation rules (apply mechanically to each table):**
1. `...baseColumns` → `...baseColumns("<prefix>")`; `...updatableColumns` → `...updatableColumns("<prefix>")` using the prefix map.
2. Every `uuid("x").references(() => T.id, opts)` → `bigint("x", { mode: "bigint" }).references(() => T.id, opts)` (preserve `.notNull()`, nullability, `onDelete`). Add `bigint` to the `drizzle-orm/pg-core` import; remove `uuid` import if now unused.
3. Each **domain** `timestamp("c", { withTimezone: true })…` → `bigint("c", { mode: "number" })…` (preserve `.notNull()`). Add `bigint` import; drop `timestamp` import where the file has no remaining carve-out timestamp.

- [ ] **Step 1: `catalog.ts`** — tables: `plans`(pln), `meal_sizes`(msz), `addons`(adn), `delivery_frequencies`(frq), `duration_packages`(dur), `delivery_zones`(zon). Replace each `...updatableColumns`/`...baseColumns` with the prefixed factory call. No FK/timestamp columns here (verify with `rg "uuid\(|timestamp\(" apps/web/db/schema/catalog.ts` → empty after edit).

- [ ] **Step 2: `auth.ts`** — `users` → `...updatableColumns("usr")`. **Carve-out:** keep `emailVerified: timestamp(...)`, `sessions.expires: timestamp(...)`, `verificationTokens.expires: timestamp(...)`, `accounts.expires_at: integer(...)` UNCHANGED. Retype FKs: `accounts.userId` (line 28) and `sessions.userId` (line 45) → `bigint("user_id",{mode:"bigint"}).notNull().references(() => users.id,{onDelete:"cascade"})`. Keep both `bigint` and `timestamp` imports.

- [ ] **Step 3: `orders.ts`** — `orders` → `...updatableColumns("ord")`; `payments` → `...baseColumns("pay")`. Retype FKs to `bigint mode:"bigint"`, preserving nullability/notNull: `userId`(nullable→users.id), `planId`, `mealSizeId`, `frequencyId`, `zoneId`(nullable→deliveryZones.id), `payments.orderId`(→orders.id). Replace `uuid` import with `bigint`. No domain timestamps here.

- [ ] **Step 4: `inquiries.ts`** — `inquiries`(inq), `inquiry_activities`(iac) → prefixed factory. Retype FKs: `assignedTo`(nullable→users.id), `convertedOrderId`(nullable→orders.id), `inquiry_activities.inquiryId`(notNull, onDelete cascade→inquiries.id). If `inquiries.ts` has any domain `timestamp(..)`, convert to `bigint mode:"number"` (per `rg`). Swap imports.

- [ ] **Step 5: `feature-flags.ts`** — `feature_flags` → `...updatableColumns("flg")` (or `baseColumns` if that's what it spreads — match current). No FKs.

- [ ] **Step 6: `user-feature-flags.ts`** — `user_feature_flags`(uff) → prefixed factory. Retype `userId`(→users.id, cascade) and `flagId`(→featureFlags.id, cascade) to `bigint mode:"bigint"`. Swap imports.

- [ ] **Step 7: `menu.ts`** — prefixes: `meal_slots`(slt), `dishes`(dsh), `menu_weeks`(mnw), `menu_items`(mni), `meal_selections`(msl). Retype FKs to `bigint mode:"bigint"`: `menu_items.menuWeekId`(cascade→menuWeeks.id), `menu_items.dishId`(→dishes.id), `meal_selections.orderId`(cascade→orders.id), `meal_selections.menuWeekId`(→menuWeeks.id), `meal_selections.dishId`(→dishes.id). Convert domain timestamps `menu_weeks.orderCutoff`(notNull) and `menu_weeks.releasedAt`(nullable) to `bigint mode:"number"`. Keep the composite unique indexes unchanged (they reference column objects, not types). Swap imports (`bigint` in; drop `timestamp`, drop `uuid`).

- [ ] **Step 8: Typecheck the schema in isolation** — `pnpm --filter web exec tsc --noEmit 2>&1 | rg "db/schema"` → no errors originating in `db/schema/*` (consumer errors elsewhere are expected — transient red). Confirm `rg -n "uuid\(" apps/web/db/schema` → empty and `rg -n "timestamp\(" apps/web/db/schema` → only the 3 auth carve-out lines.

- [ ] **Step 9: Commit**

```bash
git add apps/web/db/schema
git commit -m "feat(db): dual-id schema — bigint PK/FK + public_id + epoch-ms timestamps"
```

**Scoped verify:** `rg` checks above; schema files have no type errors of their own.

---

### Task 3: `next_id()` SQL + reset migration baseline + reseed

**Files:**
- Delete: `apps/web/db/migrations/*.sql`, `apps/web/db/migrations/meta/*`
- Create: regenerated baseline `apps/web/db/migrations/0000_*.sql` (+ `meta/0000_snapshot.json`, `meta/_journal.json`) and hand-prepend the snowflake SQL
- Modify: seeds if they assert/insert ids (`apps/web/db/seed*.ts`)
- Test: `apps/web/db/__tests__/next-id.test.ts` (create)

**Interfaces:**
- Consumes: the new schema (Task 2).
- Produces: a working dev DB with `next_id()` + `id_seq`; reseeded data.

- [ ] **Step 1: Delete old migrations** — `rm -rf apps/web/db/migrations` (the whole folder; drizzle recreates it). Confirm gone.

- [ ] **Step 2: Generate the baseline** — `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:generate --name baseline`. Expected: one `migrations/0000_baseline.sql` + `meta/0000_snapshot.json` + `_journal.json`. (Non-interactive — all "new" tables, no rename prompts.)

- [ ] **Step 3: Prepend the snowflake SQL** — at the TOP of `migrations/0000_baseline.sql`, before the first `CREATE TABLE`, insert (followed by `--> statement-breakpoint` between statements):

```sql
CREATE SEQUENCE IF NOT EXISTS id_seq;--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_id(OUT result bigint) AS $$
DECLARE
  our_epoch  bigint := 1735689600000;
  seq_id     bigint;
  now_millis bigint;
  shard_id   int := 1;
BEGIN
  SELECT nextval('id_seq') % 1024 INTO seq_id;
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) INTO now_millis;
  result := (now_millis - our_epoch) << 23;
  result := result | (shard_id << 10);
  result := result | seq_id;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
```

(The generated `id bigint PRIMARY KEY DEFAULT next_id()` column DDL already references the function; defining it first satisfies the dependency.)

- [ ] **Step 4: Reset the dev database** — recreate it so the fresh baseline applies cleanly:
  `/Applications/Postgres.app/Contents/Versions/18/bin/psql -h localhost -d postgres -c "DROP DATABASE IF EXISTS tiffin;" -c "CREATE DATABASE tiffin OWNER lawbringr;"`
  Then `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate`. Expected: baseline applies; `next_id()` + all tables created.

- [ ] **Step 5: Drift check** — `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:generate --name _verify_noop`. Expected: "No schema changes". If a migration was emitted, delete it + its journal entry + snapshot and fix the schema/baseline until the no-op is clean.

- [ ] **Step 6: Write the failing `next_id()` test** — `apps/web/db/__tests__/next-id.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("next_id()", () => {
  it("returns monotonic, unique, increasing bigints", async () => {
    const rows = await db.execute<{ id: string }>(sql`SELECT next_id() AS id FROM generate_series(1, 500)`);
    const ids = rows.rows.map((r) => BigInt(r.id));
    expect(new Set(ids.map(String)).size).toBe(500);
    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
  });

  it("encodes the custom epoch (id >> 23 ≈ ms since 2025-01-01)", async () => {
    const [{ id }] = (await db.execute<{ id: string }>(sql`SELECT next_id() AS id`)).rows;
    const msSinceEpoch = Number(BigInt(id) >> 23n);
    const wallMsSinceEpoch = Date.now() - 1735689600000;
    expect(Math.abs(wallMsSinceEpoch - msSinceEpoch)).toBeLessThan(5000);
  });
});
```

- [ ] **Step 7: Run — passes** (the function exists after migrate) — `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm exec vitest run db/__tests__/next-id.test.ts` → PASS. (If `db/client` import pulls auth, add the `vi.mock("@/lib/auth", …)` guard.)

- [ ] **Step 8: Fix + run seeds** — seeds insert via Drizzle so ids/public_ids/timestamps auto-generate; but any seed that *reads back* `row.id` to wire a relation now gets a `BigInt` (use it directly as the FK value — Drizzle accepts BigInt for bigint columns) and any seed asserting a timestamp/`weekStart` shape is unaffected. Update `apps/web/db/seed-menu.ts` if it compared `menuWeeks.weekStart` to a string (still a `date` column — unchanged) — no change needed unless tsc flags it. Run all four seeds in order:
  `cd apps/web && for s in db:seed db:seed:catalog db:seed:menu db:seed:admin; do DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm $s; done`
  Expected: all succeed, idempotent on a second `db:seed:menu` run.

- [ ] **Step 9: Commit**

```bash
git add apps/web/db
git commit -m "feat(db): reset baseline migration with next_id() snowflake + reseed"
```

**Scoped verify:** `next-id.test.ts` green; drift-free; all seeds succeed.

---

## Phase 2 — Auth.js integration

### Task 4: Auth adapter + `session.user.id = public_id`

**Files:**
- Modify: `apps/web/lib/auth/index.ts` (adapter, callbacks, authorize)
- Modify: `apps/web/lib/auth/guards.ts` if it reads `session.user.id` as a uuid
- Test: `apps/web/lib/auth/__tests__/authorize.test.ts` (update), add a callback test

**Interfaces:**
- Consumes: `users` schema (bigint id + `public_id`).
- Produces: a session whose `user.id` is the `usr_…` public id; the rest of the app keys authorization off `public_id`.

- [ ] **Step 1: Read the current auth setup** — open `apps/web/lib/auth/index.ts`. Identify the DrizzleAdapter wiring, the `authorize` (credentials) callback, and the `jwt`/`session` callbacks. Note where `user.id` flows into the token.

- [ ] **Step 2: jwt/session callbacks emit `public_id`** — in the `jwt` callback, when `user` is present, set `token.id = user.publicId` (the adapter/authorize must surface `publicId` on the returned user — see Step 3). In the `session` callback set `session.user.id = token.id`. Ensure `token.role` continues to carry the role.

- [ ] **Step 3: `authorize` returns `publicId` as `id`** — the credentials `authorize` looks up the user by email/phone; make it return `{ id: row.publicId, publicId: row.publicId, email, name, role }` (NOT the bigint). The bigint `row.id` stays server-side. Verify `resolveCredentialUser` (or equivalent) selects `publicId`.

- [ ] **Step 4: Adapter compatibility** — the DrizzleAdapter creates users by `insert().returning()`. Because `users.id` has a DB default (`next_id()`) the adapter may omit it; confirm the adapter config maps the users table correctly and that the returned bigint is read with `mode:"bigint"`. If the adapter's typed `id: string` expectation conflicts, wrap/transform in the adapter config so that adapter-facing `id` is the stringified bigint while app code uses `public_id`. Document any wrapper inline in the file.

- [ ] **Step 5: Update guards** — in `apps/web/lib/auth/guards.ts`, any comparison/return of the user id now deals in `public_id` (string `usr_…`). No bigint leaks to callers.

- [ ] **Step 6: Update + write tests** — update `authorize.test.ts` so the authenticated user's `id` equals the seeded admin's `public_id` pattern `/^usr_/`. Add a `session` callback unit test asserting `session.user.id` is the `usr_…` public id given a token. Use the `vi.mock("@/lib/auth", …)`-free direct import only for pure callback functions; DB-touching authorize tests follow the existing mock pattern.

- [ ] **Step 7: Run auth tests** — `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm exec vitest run lib/auth/__tests__/authorize.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/auth
git commit -m "feat(auth): session.user.id = public_id; adapter on bigint users.id"
```

**Scoped verify:** auth tests green; `lib/auth` typechecks. (Repo-wide red still expected until Phase 3.)

---

## Phase 3 — Service/route boundary mapping + restore green

### Task 5: Epoch→local timestamp converter (UI-only)

**Files:**
- Create: `apps/web/lib/format/datetime.ts`
- Test: `apps/web/lib/format/__tests__/datetime.test.ts`

**Interfaces:**
- Produces: `formatEpoch(ms: number, opts?: { timeZone?: string; mode?: "date" | "datetime" | "time" | "relative" }): string` and `epochToDate(ms: number): Date`. Consumed by every client UI component that displays a timestamp (Tasks 7–10). The server never calls these — it passes raw epoch ms to the client.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/format/__tests__/datetime.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { epochToDate, formatEpoch } from "../datetime";

const ms = Date.UTC(2026, 5, 22, 18, 30, 0); // 2026-06-22T18:30:00Z

describe("formatEpoch", () => {
  it("formats a fixed timeZone deterministically (datetime)", () => {
    const s = formatEpoch(ms, { timeZone: "America/Toronto", mode: "datetime" });
    expect(s).toContain("2026");
    expect(s).toMatch(/2:30|14:30/); // 18:30Z = 14:30 EDT
  });

  it("renders the same instant differently across zones", () => {
    const tor = formatEpoch(ms, { timeZone: "America/Toronto", mode: "time" });
    const kol = formatEpoch(ms, { timeZone: "Asia/Kolkata", mode: "time" });
    expect(tor).not.toEqual(kol);
  });

  it("epochToDate round-trips the instant", () => {
    expect(epochToDate(ms).getTime()).toBe(ms);
  });
});
```

- [ ] **Step 2: Run — fails** — `cd apps/web && pnpm exec vitest run lib/format/__tests__/datetime.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `apps/web/lib/format/datetime.ts`

```ts
export function epochToDate(ms: number): Date {
  return new Date(ms);
}

type FormatMode = "date" | "datetime" | "time" | "relative";

const PRESETS: Record<Exclude<FormatMode, "relative">, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "short", day: "numeric" },
  datetime: { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  time: { hour: "numeric", minute: "2-digit" },
};

export function formatEpoch(
  ms: number,
  opts: { timeZone?: string; mode?: FormatMode } = {},
): string {
  const { mode = "datetime", timeZone } = opts;
  if (mode === "relative") {
    const diff = ms - Date.now();
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }
  return new Intl.DateTimeFormat(undefined, { ...PRESETS[mode], timeZone }).format(ms);
}
```

(Default `timeZone` undefined → `Intl` uses the runtime's zone, which in a client component is the user's own. Client callers may pass `Intl.DateTimeFormat().resolvedOptions().timeZone` explicitly when they need it pinned.)

- [ ] **Step 4: Run — passes** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/format
git commit -m "feat(format): UI-only epoch→local timestamp converter"
```

**Scoped verify:** `datetime.test.ts` green; module typechecks. (Wiring existing UI date displays through `formatEpoch` happens in Tasks 8–10 as those client components are touched — any timestamp rendered in a client component reads the epoch `number` from props and calls `formatEpoch`; server components pass the raw `number` down.)

---

### Task 6: Repository/service public-id boundary in `@tiffin/commons-drizzle`

**Files:**
- Modify: `packages/commons-drizzle/src/repository.ts`, `service.ts`, `types.ts`, `index.ts`
- Test: `packages/commons-drizzle/src/repository.test.ts` (create or extend)

**Interfaces:**
- Produces: `Repository` keyed on a **publicId** column for external ops, ordered by the **internal id** for pagination; `findByPublicId(publicId)`, `updateByPublicId`, `deleteByPublicId`; `BaseService`/`UpdatableService`/`SessionService` operate on `public_id` externally and resolve the acting user's internal bigint for audit stamping.

- [ ] **Step 1: Repository constructor takes both columns** — change the constructor from `(db, table, idColumn)` to `(db, table, publicIdColumn, internalIdColumn)`. `findByPublicId(publicId: string)` filters `eq(publicIdColumn, publicId)`. Pagination/`list` orders by `internalIdColumn` (sequential, not the random nanoid). `deleteByPublicId`/`updateByPublicId` filter on `publicIdColumn` and `returning()` the row. Keep an internal `findById(internalId: bigint)` for joins.

```ts
// repository.ts — key shape (full method bodies mirror the existing ones, swapping the filter column)
constructor(
  protected readonly db: Db,
  protected readonly table: TTable,
  protected readonly publicIdColumn: PgColumn,
  protected readonly internalIdColumn: PgColumn,
) {}

async findByPublicId(publicId: string) {
  const [row] = await this.db.select().from(this.table as PgTable).where(eq(this.publicIdColumn, publicId)).limit(1);
  return row ?? null;
}
```

- [ ] **Step 2: Service layer** — `BaseService.findById` → `findByPublicId(publicId: string)`; `update`/`delete` take `publicId`. `SessionService` audit stamping: it currently stamps `createdBy/updatedBy` from `session.user.id`; that is now a `public_id`, but the columns are bigint. Resolve once: `const actor = session?.user?.id ? (await usersRepo.findByPublicId(session.user.id))?.id : null;` and stamp the bigint `actor`. (Inject a minimal users lookup or pass the resolved bigint in — choose the lighter wiring and keep it in `session-service.ts` in the web app, not commons, if commons must stay DB-agnostic.)
- [ ] **Step 3: Update construction sites** — every `new UpdatableRepository(db, table, table.id)` becomes `new UpdatableRepository(db, table, table.publicId, table.id)`. (Grep: `rg -n "new (Updatable|Base|SoftDelete)?Repository\(" apps/web` — update each.)

- [ ] **Step 4: Tests** — extend repo tests: `findByPublicId` returns the row; `list` orders by internal id ascending; `deleteByPublicId` removes by public id. Run `pnpm --filter @tiffin/commons-drizzle test` → green.

- [ ] **Step 5: Commit**

```bash
git add packages/commons-drizzle apps/web/lib/services/session-service.ts
git commit -m "feat: repository/service public-id boundary + bigint audit resolution"
```

**Scoped verify:** commons-drizzle tests green; `session-service.ts` typechecks.

---

### Task 7: Catalog + orders + public funnel (checkout/wizard/activate)

**Files (modify):** `apps/web/lib/services/catalog.service.ts`, `orders.service.ts`, catalog loaders/actions, `app/(public)/checkout/*`, `components/checkout/*`, `components/wizard/*`, `app/(public)/subscribe/page.tsx`, `app/(public)/activate/[deploymentId]/*`, and the catalog REST routes.

**Interfaces:**
- Consumes: Task 6 repositories; `public_id` boundary.
- Produces: order creation/read keyed on `public_id`; `createOrder` resolves catalog `public_id`s (or internal ids from the loader) to bigint FK values.

- [ ] **Step 1: Catalog loader returns both ids** — wherever the catalog snapshot is loaded (`@/lib/catalog/load`), include `id` (bigint) AND `publicId`. The wizard/checkout select by `publicId` (sent from client); `createOrder` writes the bigint FK (`planId`, `mealSizeId`, `frequencyId`, `zoneId`). Verify no client payload carries a bigint.

- [ ] **Step 2: `createOrder`** — its `CreateOrderInput` references catalog entities by `public_id` from the client; resolve each to the bigint id before insert. `userId` is the acting user's bigint (resolve from `session.user.id` public id). The returned order exposes `publicId` (the `ord_…`) to the client, never the bigint.

- [ ] **Step 3: REST routes** — catalog `[id]` routes now take a `public_id` path param; the route resolves via `findByPublicId`. Update `createResourceRoute`/`createCollectionRoute` usages if they assumed uuid path params.

- [ ] **Step 4: Public funnel** — checkout/wizard/activate pass `public_id`s end to end; `activate/[deploymentId]` is keyed on `deployment_id` (unchanged, not an id). Confirm the confirm action returns the order `public_id`.

- [ ] **Step 5: Targeted tests** — update `orders.service.test.ts` and pricing/build-catalog tests to use `public_id`-shaped inputs where they construct catalog refs; assert created order exposes a `ord_…` `publicId`. Run `cd apps/web && DATABASE_URL=… pnpm exec vitest run lib/services/__tests__/orders.service.test.ts lib/pricing` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib apps/web/app/\(public\) apps/web/components
git commit -m "feat(orders): public-id boundary across orders + public funnel"
```

**Scoped verify:** orders + pricing targeted tests green; touched files typecheck.

---

### Task 8: Inquiries CRM

**Files (modify):** `apps/web/lib/services/inquiries.service.ts`, `app/(dashboard)/dashboard/inquiries/**` (list, `[id]`, `[id]/order`), inquiries REST routes.

**Interfaces:**
- Consumes: Task 6 boundary; `public_id`.
- Produces: inquiry pages/actions keyed on `inq_…`; `convert()` writes bigint FKs (`convertedOrderId`, `assignedTo`) resolved from public ids; activities link by bigint `inquiryId`.

- [ ] **Step 1: Service** — `inquiriesService` CRUD/notes/stage/convert take `public_id` for the inquiry; internal joins (activities, converted order) use resolved bigints. `assignedTo`/`convertedOrderId` stamped as bigints (resolve from the relevant public ids).
- [ ] **Step 2: Routes/pages** — `inquiries/[id]` param is the inquiry `public_id`; detail/timeline/order pages resolve it. Agent order form posts catalog `public_id`s (Task 7 path).
- [ ] **Step 3: Targeted tests** — update inquiries tests (`inquiries*.test.ts`, `inquiries-convert.test.ts`) to `public_id`; assert convert produces an order with an `ord_…` id linked back. Run `cd apps/web && DATABASE_URL=… pnpm exec vitest run lib/services/__tests__/inquiries*.test.ts` → PASS.
- [ ] **Step 4: Commit** — `git add apps/web/lib apps/web/app/\(dashboard\)/dashboard/inquiries && git commit -m "feat(inquiries): public-id boundary across CRM"`

**Scoped verify:** inquiries targeted tests green; touched files typecheck.

---

### Task 9: Menu, dishes, meal-slots, My-meals + ownership

**Files (modify):** `apps/web/lib/services/{dishes,meal-slots,menu}.service.ts`, `apps/web/lib/menu/selections.service.ts`, `app/(dashboard)/dashboard/{dishes,menus,settings/meal-slots,meals}/**`, dishes/meal-slots REST routes.

**Interfaces:**
- Consumes: Task 6 boundary; `session.user.id` = `public_id` (Task 4); `formatEpoch` (Task 5) for any timestamp shown in client UI.
- Produces: menu builder/selection keyed on `public_id`; `pickDish` ownership compares `order.user public_id` to `session.user.id`; `setSelection` writes bigint FKs.

- [ ] **Step 1: Services** — dishes/meal-slots/menu services take `public_id` externally; `menuService.addItem`/`setDefault`/`weekWithItems` resolve week/dish public ids to bigints for the menu_items writes. `selectionsService.setSelection` receives the resolved order + week rows (bigint joins) but validates ownership/lock/diet as before.
- [ ] **Step 2: `pickDish` ownership** — in `app/(dashboard)/dashboard/meals/actions.ts`, the action receives the order `public_id`; load the order by `findByPublicId`; ownership check compares `session.user.id` (a `usr_…`) to the order's owner `public_id` (join users → publicId), OR resolve `session.user.id`→bigint and compare to `order.userId`. Pick one and keep it consistent. Staff (admin/member) bypass unchanged.
- [ ] **Step 3: Meals page** — `meals/page.tsx` loads the user's order via the resolved internal id; the grid posts the order `public_id` + day/slot/person + dish `public_id`; the action resolves to bigints.
- [ ] **Step 4: Targeted tests** — update `menu.service.test.ts`, `selections.service.test.ts`, `dishes-soft-delete.test.ts`, `meal-slots.service.test.ts` to construct rows and assert via `public_id`/bigint correctly. Run `cd apps/web && DATABASE_URL=… pnpm exec vitest run lib/services/__tests__/menu.service.test.ts lib/services/__tests__/dishes-soft-delete.test.ts lib/services/__tests__/meal-slots.service.test.ts lib/menu` → PASS.
- [ ] **Step 5: Commit** — `git add apps/web/lib apps/web/app/\(dashboard\)/dashboard/{dishes,menus,settings,meals} && git commit -m "feat(menu): public-id boundary across menu engine + meals ownership"`

**Scoped verify:** menu/selection targeted tests green; touched files typecheck.

---

### Task 10: Users + feature flags admin

**Files (modify):** `apps/web/lib/services/{users,feature-flags,user-feature-flags}.service.ts`, `app/(dashboard)/dashboard/users/**`, users + feature-flags + user-feature-flags REST routes.

**Interfaces:**
- Consumes: Task 6 boundary.
- Produces: user/flag admin keyed on `public_id`; `user_feature_flags` upsert writes bigint `userId`/`flagId`; `updateContact` keyed on user `public_id`.

- [ ] **Step 1: Services** — users/feature-flags/user-feature-flags services take `public_id` externally; uff upsert resolves user + flag public ids to bigints. `updateContact`/`resolveCredentialUser` select `publicId` and operate accordingly.
- [ ] **Step 2: Pages/routes** — `dashboard/users` row actions post user `public_id`; user-row links use `public_id`. Admin REST `[id]` params are public ids.
- [ ] **Step 3: Targeted tests** — update `users-contact.test.ts`, `users-writable.test.ts`, `user-feature-flags.service.test.ts` to `public_id`. Run `cd apps/web && DATABASE_URL=… pnpm exec vitest run lib/services/__tests__/users-contact.test.ts lib/services/__tests__/users-writable.test.ts lib/services/__tests__/user-feature-flags.service.test.ts` → PASS.
- [ ] **Step 4: Commit** — `git add apps/web/lib apps/web/app/\(dashboard\)/dashboard/users && git commit -m "feat(users): public-id boundary across user + flag admin"`

**Scoped verify:** users/flags targeted tests green; touched files typecheck.

---

### Task 11: Full green + sweep + reseed

**Files:** any remaining consumers surfaced by typecheck; `app/(dashboard)/dashboard/page.tsx` (overview) and any loader not yet touched.

- [ ] **Step 1: Repo-wide typecheck** — `pnpm typecheck`. Fix every remaining error (these are the last consumers still passing/reading a uuid-shaped id). Expected end state: clean.
- [ ] **Step 2: Full suite** — `cd /Users/lawbringr/IdeaProjects/tiffin-grab && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test`. Fix failures until all green (88 baseline + new factory/next_id/repo tests).
- [ ] **Step 3: Build** — `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build` → green; all routes present.
- [ ] **Step 4: Sweep checks** — `rg -n "uuid\(" apps/web/db packages/commons-drizzle/src` → empty; `rg -n "timestamp\(" apps/web/db/schema` → only the 3 auth carve-out lines; `rg -n "mode: ?\"number\"" apps/web/db/schema | wc -l` ≥ the domain timestamp count.
- [ ] **Step 5: Reseed** — `cd apps/web && for s in db:seed db:seed:catalog db:seed:menu db:seed:admin; do DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm $s; done`. Confirm final counts + a sample `SELECT public_id FROM orders LIMIT 1` shows `ord_…`.
- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete dual-id boundary — full suite green"
```

**Verify (the green gate):** `DATABASE_URL=… pnpm test && pnpm typecheck && DATABASE_URL=… pnpm build` all green; sweep checks pass; DB reseeded; a login smoke yields `session.user.id` = `usr_…`.

---

## Self-review notes

- **Spec coverage:** dual id + factory → Task 1–2; snowflake `next_id()` + reset baseline → Task 3; Auth.js `session.user.id = public_id` → Task 4; epoch→local UI converter (epoch in/out) → Task 5; FKs on bigint → Task 2 (schema) + Tasks 6–10 (resolution); epoch-ms timestamps + auth carve-out → Task 2; boundary mapping → Tasks 6–10; testing (factory, next_id, converter, suite) → Tasks 1,3,5,11; verification sweep (`rg uuid/timestamp`) → Task 11.
- **Transient red is explicit** (Global Constraints) so SDD reviewers judge Tasks 2–4 and 6–10 on scoped checks, full green only at Task 11. Task 5 (UI converter) is independently green.
- **Type consistency:** `makePublicId`/`baseColumns(prefix)`/`updatableColumns(prefix)` (Task 1) used identically in Task 2; `formatEpoch`/`epochToDate` (Task 5) used by UI in Tasks 8–10; repository `findByPublicId(publicId: string)` + `(db, table, publicIdColumn, internalIdColumn)` constructor (Task 6) used in Tasks 7–10; `session.user.id` is a `public_id` string from Task 4 onward.
- **Known risk to watch in execution:** the Auth.js DrizzleAdapter's `id: string` typing vs a bigint `users.id` (Task 4 Step 4) — if the adapter cannot tolerate a bigint PK, fall back to giving the auth tables a string PK = the public id (spec §Risk B alternative) and escalate before forcing it.
