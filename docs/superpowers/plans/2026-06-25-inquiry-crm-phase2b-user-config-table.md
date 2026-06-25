# Inquiry CRM Phase 2b — Per-Source `inquiry_user_config` Table

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the per-user pool flags (`users.acceptsLeads`/`inDefaultPool`) and the jsonb `weights` map with a queryable per-(source,user) table `inquiry_user_config`, so inbound assignment fetches a source's eligible members + weights with one indexed query — enroll = insert a row, remove = delete a row.

**Architecture:** `inquiry_user_config(userId, sourceId nullable, weight)` — a row means "this user is in this source's pool with this weight"; `sourceId = NULL` is the source-agnostic **default pool**. The engine's `PoolMember` carries its own `weight` (no more jsonb `weights`). `app_settings.leadAssignment` jsonb keeps only `strategy` + `perSource` + `cursor`. Settings UI manages per-source membership; the users-admin pool toggles are removed.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/`), Drizzle, shadcn, Vitest.

## Global Constraints

- Writes through commons services; `@tiffin/commons*` for shared code (TD-1). Typed admin controls (TD-3).
- Single squashed baseline; local dev DB gets **non-destructive** ALTERs (create table, drop columns) — never wipe `tiffin`. Verify regenerated baseline only against a throwaway DB.
- No new deps. Ignore the `db/__tests__/next-id.test.ts` flake. `usr_system` stays the terminal fallback (never null for inbound).

## Model

```
inquiry_user_config
  userId   bigint  -> users.id     (notNull)
  sourceId bigint  -> lead_sources.id  (NULL = default pool)
  weight   integer default 1
  unique(userId, sourceId)
  index(sourceId)

Pool for source X  = rows where sourceId = X
Default pool       = rows where sourceId IS NULL
```

---

### Task 1: Schema — add table, drop user pool flags

**Files:**
- Create: `apps/web/db/schema/inquiry-user-config.ts`
- Modify: `apps/web/db/schema/auth.ts` (remove `acceptsLeads`, `inDefaultPool`)
- Modify: `apps/web/db/schema/index.ts` (export)
- Migration: non-destructive local ALTERs + regenerate canonical baseline

**Interfaces:**
- Produces: `inquiryUserConfig` table; `users` no longer has pool flags (keeps `isSystem`).

- [ ] **Step 1: Schema file**

```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { bigint, integer, index, pgTable, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { leadSources } from "./lead-sources";

export const inquiryUserConfig = pgTable("inquiry_user_config", {
  ...updatableColumns("iuc"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  // NULL sourceId = the source-agnostic default pool.
  sourceId: bigint("source_id", { mode: "bigint" }).references(() => leadSources.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(1),
}, (t) => [
  unique("inquiry_user_config_user_source_unq").on(t.userId, t.sourceId),
  index("inquiry_user_config_source_idx").on(t.sourceId),
]);
```

Export `export * from "./inquiry-user-config";` from `index.ts`. Remove `acceptsLeads`/`inDefaultPool` lines from `auth.ts` `users` (keep `isSystem`).

- [ ] **Step 2: Non-destructive local ALTERs**

```bash
cd apps/web
node --env-file=.env.local -e "const p=require('postgres');const s=p(process.env.DATABASE_URL);(async()=>{await s\`create table if not exists inquiry_user_config (id bigint primary key default next_id(), public_id text not null unique, created_at bigint not null, created_by bigint, updated_at bigint not null, updated_by bigint, user_id bigint not null references users(id) on delete cascade, source_id bigint references lead_sources(id) on delete cascade, weight integer not null default 1, constraint inquiry_user_config_user_source_unq unique(user_id, source_id))\`;await s\`create index if not exists inquiry_user_config_source_idx on inquiry_user_config(source_id)\`;await s\`alter table users drop column if exists accepts_leads\`;await s\`alter table users drop column if exists in_default_pool\`;console.log('migrated');await s.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
```

- [ ] **Step 3: Regenerate canonical baseline** (Phase 0 procedure: preamble capture → `rm` migrations/meta → `pnpm db:generate` → rename `0000_baseline.sql` → re-prepend preamble → fix journal tag). Verify against a throwaway DB only (`createdb tiffin_p2btest` → migrate → `dropdb`). Do NOT touch `tiffin`.

- [ ] **Step 4: Typecheck**

`pnpm --filter web exec tsc --noEmit` — WILL fail in the engine/service/UI that reference the removed flags + jsonb weights (fixed in Tasks 2–6). Note failures; commit the schema.

- [ ] **Step 5: Commit**

```bash
git add apps/web/db/schema apps/web/db/migrations
git commit -m "feat(schema): inquiry_user_config table; drop user pool flags"
```

---

### Task 2: Engine — weight on the member, drop jsonb weights

**Files:**
- Modify: `apps/web/lib/services/assignment.ts`
- Modify: `apps/web/lib/services/__tests__/assignment.test.ts`
- Modify: `apps/web/lib/services/app-settings.service.ts` (drop `weights` from default/type usage)

**Interfaces:**
- Produces: `PoolMember { id: bigint; publicId: string; weight: number }`; `LeadAssignmentConfig` without `weights`; `pickAssignee` percentage uses `member.weight`.

- [ ] **Step 1: Update tests first (red)**

Change the percentage test to put weights on the pool members, not `cfg.weights`:

```ts
const wpool: PoolMember[] = [{ id: 1n, publicId: "a", weight: 1 }, { id: 2n, publicId: "b", weight: 3 }, { id: 3n, publicId: "c", weight: 1 }];
it("weights selection by member weight", () => {
  expect(pickAssignee("percentage", wpool, base, "x", 0.5).chosen?.publicId).toBe("b"); // b band [0.2,1)
  expect(pickAssignee("percentage", wpool, base, "x", 0.1).chosen?.publicId).toBe("a");
});
```

Add `weight: 1` to every `PoolMember` literal in the other tests. Remove `weights` from the `base` config literal.

Run: `pnpm --filter web test assignment` → FAIL.

- [ ] **Step 2: Implement**

In `assignment.ts`:
- `export interface LeadAssignmentConfig { strategy: Strategy; perSource: Record<string, Strategy>; cursor: Record<string, string> }` (remove `weights`).
- `export interface PoolMember { id: bigint; publicId: string; weight: number }`.
- In percentage: `const weights = sorted.map((m) => Math.max(0, m.weight));` (drop `cfg.weights`).

In `app-settings.service.ts`: `ASSIGNMENT_DEFAULT = { strategy: "creator", perSource: {}, cursor: {} }` (remove `weights`).

Run: `pnpm --filter web test assignment` → PASS. `tsc --noEmit` still red in service/UI (next tasks).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/services/assignment.ts apps/web/lib/services/__tests__/assignment.test.ts apps/web/lib/services/app-settings.service.ts
git commit -m "refactor(assignment): weight on pool member; drop jsonb weights map"
```

---

### Task 3: `inquiry-user-config` service + pool queries

**Files:**
- Create: `apps/web/lib/services/inquiry-user-config.service.ts`

**Interfaces:**
- Produces:
  - `poolForSource(sourceId: bigint | null): Promise<PoolMember[]>` — joins `users`, returns `{ id, publicId, weight }`.
  - `listConfig(): Promise<{ userPublicId; userName; sourceId; sourceKey | null; weight }[]>` — for the settings UI.
  - `setMembership(sourceId: bigint | null, members: { userId: bigint; weight: number }[])` — replace the membership of a (source|default) pool: delete rows not in `members`, upsert the rest.

- [ ] **Step 1: Implement**

```ts
import { db } from "@/db/client";
import { inquiryUserConfig, users } from "@/db/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";
import type { PoolMember } from "./assignment";

export async function poolForSource(sourceId: bigint | null): Promise<PoolMember[]> {
  return db
    .select({ id: users.id, publicId: users.publicId, weight: inquiryUserConfig.weight })
    .from(inquiryUserConfig)
    .innerJoin(users, eq(inquiryUserConfig.userId, users.id))
    .where(sourceId == null ? isNull(inquiryUserConfig.sourceId) : eq(inquiryUserConfig.sourceId, sourceId));
}

export async function setMembership(sourceId: bigint | null, members: { userId: bigint; weight: number }[]) {
  const keep = members.map((m) => m.userId);
  const where = sourceId == null ? isNull(inquiryUserConfig.sourceId) : eq(inquiryUserConfig.sourceId, sourceId);
  await db.delete(inquiryUserConfig).where(keep.length ? and(where, /* not in keep */ ) : where);
  // simplest: delete all for the pool, then insert the desired set (small N, admin action)
}
```

Implement `setMembership` as: `delete where (pool)` then `insert` the `members` (each `{ userId, sourceId, weight }`). Small N, admin-triggered — replace-all is clean and avoids upsert plumbing. `listConfig` left-joins `leadSources` for the key.

- [ ] **Step 2: Typecheck (service compiles; callers next)** — defer commit to Task 4.

---

### Task 4: `resolveOwner` reads the table

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Modify: `apps/web/lib/services/__tests__/inquiries-assignment.service.test.ts`

**Interfaces:**
- Consumes: `poolForSource`. Produces: inbound `resolveOwner(sourceId, sourceKey, isInbound)` → `poolForSource(sourceId)` → empty → `poolForSource(null)` (default pool) → empty → system.

- [ ] **Step 1: Update the test (red)**

Replace the user-flag seeding (`acceptsLeads`/`inDefaultPool`) with `inquiry_user_config` rows: seed members, then `db.insert(inquiryUserConfig).values({ userId, sourceId, weight })` for the source under test; for the default-pool case insert with `sourceId: null`. Clean up `inquiry_user_config` in `afterAll`. Keep the never-delete-system-user rule.

Run: `pnpm --filter web test inquiries-assignment` → FAIL.

- [ ] **Step 2: Implement**

Replace the `pool` helper + `resolveOwner` body:

```ts
private async resolveOwner(sourceId: bigint, sourceKey: string, isInbound: boolean): Promise<bigint> {
  if (!isInbound) {
    const actor = await this.currentUserId();
    return actor ?? (await this.systemUserId());
  }
  const cfg = await getLeadAssignment();
  const strat = strategyFor(cfg, sourceKey);
  if (strat === "creator") {
    const actor = await this.currentUserId();
    return actor ?? (await this.systemUserId());
  }
  const pool = (await poolForSource(sourceId)).length
    ? await poolForSource(sourceId)
    : await poolForSource(null);
  if (!pool.length) return this.systemUserId();
  const roll = await this.rollFor();
  const { chosen, cursorPublicId } = pickAssignee(strat, pool, cfg, sourceKey, roll);
  if (!chosen) return this.systemUserId();
  if (strat === "round_robin" && cursorPublicId) {
    await setLeadAssignment({ ...cfg, cursor: { ...cfg.cursor, [sourceKey]: cursorPublicId } });
  }
  return chosen.id;
}
```

(Cache the first `poolForSource(sourceId)` call into a const to avoid the double query.) Delete the old `pool` helper. In `create`, call `await this.resolveOwner(sourceId, sourceKey, isInbound)`. Import `poolForSource`.

Run: `pnpm --filter web test inquiries-assignment inquiries-source-owner` → PASS.

- [ ] **Step 3: Commit Tasks 3 & 4**

```bash
git add apps/web/lib/services/inquiry-user-config.service.ts apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-assignment.service.test.ts
git commit -m "feat(inquiries): resolve owner from inquiry_user_config (per-source + default pool)"
```

---

### Task 5: Settings UI → per-source membership

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/settings/lead-assignment/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/settings/lead-assignment/form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/settings/lead-assignment/actions.ts`

**Interfaces:**
- Produces: per inbound source — a strategy override `Select` + a member list (add staff user with weight, remove); plus a **Default pool** section (`sourceId = null`). `saveMembership(sourceKey | null, members)` action persists via `setMembership`.

- [ ] **Step 1: Action**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { leadSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setMembership } from "@/lib/services/inquiry-user-config.service";
import { setLeadAssignment, getLeadAssignment } from "@/lib/services/app-settings.service";
import type { Strategy } from "@/lib/services/assignment";

export async function saveMembership(sourceKey: string | null, members: { userId: string; weight: number }[]) {
  await requireAdmin();
  let sourceId: bigint | null = null;
  if (sourceKey) {
    const [s] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, sourceKey)).limit(1);
    sourceId = s?.id ?? null;
  }
  await setMembership(sourceId, members.map((m) => ({ userId: BigInt(m.userId), weight: m.weight })));
  revalidatePath("/dashboard/settings/lead-assignment");
}

export async function saveStrategy(strategy: Strategy, perSource: Record<string, Strategy>) {
  await requireAdmin();
  const cfg = await getLeadAssignment();
  await setLeadAssignment({ ...cfg, strategy, perSource });
  revalidatePath("/dashboard/settings/lead-assignment");
}
```

- [ ] **Step 2: Page** — `requireAdmin`; load `getLeadAssignment()`, active inbound `leadSources`, staff users (`role != "user"`), and `listConfig()` grouped by source. Pass to the form.

- [ ] **Step 3: Form** — global strategy `Select`; for each inbound source + a "Default pool" pseudo-source: strategy override `Select` (sources only) and a membership editor (a row per member: user `Select` from staff + weight `Input`, an add button, a remove button) that calls `saveMembership(sourceKey|null, members)`.

- [ ] **Step 4: Typecheck + manual + commit**

`pnpm --filter web exec tsc --noEmit` → PASS.
Manual: enroll two members under facebook with weights; set facebook→percentage; create an inbound facebook inquiry → routes within those members. Default-pool section enrolls a fallback member.

```bash
git add apps/web/app/\(dashboard\)/dashboard/settings/lead-assignment
git commit -m "feat(admin): per-source lead membership + weights settings"
```

---

### Task 6: Revert users-admin pool toggles

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/users/user-row.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/users/actions.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/users/page.tsx`

**Interfaces:**
- Produces: the `acceptsLeads`/`inDefaultPool` Switches + `setLeadFlags` removed (those columns no longer exist); membership now lives in the lead-assignment settings page. `setUserFlag`/`setUserRole` (feature flags/role) untouched.

- [ ] **Step 1: Remove the toggles** — delete the two `Switch`es + their column from `user-row.tsx`, the `setLeadFlags` action, and the `acceptsLeads`/`inDefaultPool` fields from the `page.tsx` users select + the `UserRow` props/type.

- [ ] **Step 2: Typecheck + full test run**

`pnpm --filter web exec tsc --noEmit` → PASS.
`pnpm --filter web test` → green except `next-id` flake.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/users
git commit -m "refactor(users): drop pool toggles (membership moved to lead-assignment settings)"
```

---

## Self-Review

**Coverage:** per-(source,user) table with default-pool via NULL sourceId (Task 1); weight-on-member engine (Task 2); pool queries + resolveOwner from the table (Tasks 3–4); per-source membership admin (Task 5); old per-user toggles removed (Task 6). Strategy/cursor stay in the small jsonb (unchanged).

**Placeholder scan:** Task 3 Step 1 sketches `setMembership` then specifies the concrete "delete-all-for-pool then insert" implementation in prose — implementer writes the explicit delete+insert. Everything else is full code.

**Type consistency:** `PoolMember` gains `weight` (Task 2), produced by `poolForSource` (Task 3), consumed by `pickAssignee` + `resolveOwner` (Task 4). `LeadAssignmentConfig` loses `weights` consistently across assignment.ts + app-settings.service.ts. `setMembership(sourceId|null, members)` shape matches between service (Task 3) and action (Task 5).

**Caveat:** another baseline regen (verified on throwaway DB; local uses non-destructive ALTER incl. `drop column`). The two dropped `users` columns are unused outside the code changed here.

---

## Execution Handoff

Executes via an **ultracode workflow**, same shape as Phases 0–2: sequential agents (schema → engine → service → resolveOwner → settings UI → users revert), `tsc`+`vitest` verify gate (ignore `next-id`; assert the shared `tiffin` DB keeps its `inquiries`/system user), final adversarial review. DB steps use non-destructive ALTERs; baseline verified on a throwaway DB only.
