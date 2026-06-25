# Inquiry CRM Phase 2 — Lead Sources Admin + Assignment Rules Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lead routing configurable: admin CRUD for sources/sub-sources, an `acceptsLeads`/`inDefaultPool` staff pool, and a strategy engine (creator / round-robin / percentage, per source) that assigns inbound inquiries — falling back default-pool → system user.

**Architecture:** Sources/sub-sources reuse the catalog typed-CRUD pattern (`resource-config` + `resource-editor` + `SoftDeleteService`). Assignment config lives in a new `app_settings.leadAssignment` jsonb. A pure `pickAssignee` engine (unit-tested) is called by `inquiriesService.resolveOwner` for inbound sources; cursor state for round-robin persists back into the jsonb.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/`), Drizzle, RHF/zod where forms appear, shadcn, Vitest.

## Global Constraints

- Shared code → `@tiffin/commons{,-drizzle,-next}` (TD-1); writes through commons services (subclass + `super`).
- Admin/typed inputs: select/date/switch — never free-text for enums/refs/bools (TD-3).
- Single squashed baseline migration; for the local already-migrated dev DB apply a **non-destructive ALTER** (do NOT wipe dev data) AND keep the regenerated baseline canonical for fresh installs.
- No new npm dependencies. Run from `apps/web`. Ignore the known `db/__tests__/next-id.test.ts` flake.
- `usr_system` (isSystem) is the terminal fallback — `resolveOwner` must NEVER return null for an inbound source.

## File Structure

- `apps/web/db/schema/app-settings.ts` — add `leadAssignment jsonb`.
- `apps/web/lib/services/lead-sources.service.ts` — NEW `leadSourceService` + `leadSubsourceService` (soft-delete on `active`).
- `apps/web/lib/services/assignment.ts` — NEW pure engine: `pickAssignee`, types.
- `apps/web/lib/services/inquiries.service.ts` — `resolveOwner` calls the engine; load/persist config + cursor.
- `apps/web/lib/services/app-settings.service.ts` — `getLeadAssignment` / `setLeadAssignment`.
- `apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts` — add `lead-sources`/`lead-subsources` defs; extend `FieldType` with `boolean` + `optionsSource: "leadSources"`.
- `apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx` — render `boolean` (Switch) + dynamic `leadSources` options.
- `apps/web/app/(dashboard)/dashboard/catalog/actions.ts` — add the two services to `SERVICES`.
- `apps/web/app/(dashboard)/dashboard/settings/lead-assignment/` — NEW admin config page + form + action.
- `apps/web/app/(dashboard)/dashboard/users/user-row.tsx` + `actions.ts` — `acceptsLeads`/`inDefaultPool` toggles.

---

### Task 1: `app_settings.leadAssignment` column (non-destructive)

**Files:**
- Modify: `apps/web/db/schema/app-settings.ts`
- Modify: `apps/web/db/migrations/0000_baseline.sql` + `meta/` (regenerate)

**Interfaces:**
- Produces: `appSettings.leadAssignment: jsonb | null`.

- [ ] **Step 1: Add the column to schema**

```ts
import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
// ...inside appSettings, after cutoffHour:
  leadAssignment: jsonb("lead_assignment"),
```

- [ ] **Step 2: Non-destructive ALTER on the local dev DB**

```bash
cd apps/web
node --env-file=.env.local -e "const p=require('postgres');const s=p(process.env.DATABASE_URL);s\`alter table app_settings add column if not exists lead_assignment jsonb\`.then(()=>{console.log('altered');return s.end()}).catch(e=>{console.error(e.message);process.exit(1)})"
```

- [ ] **Step 3: Regenerate the canonical baseline (for fresh installs)**

Follow the Phase 0 procedure: capture the `next_id()` preamble, `rm` migrations + meta, `pnpm db:generate`, rename to `0000_baseline.sql`, re-prepend the preamble, fix `meta/_journal.json` tag to `0000_baseline`. Verify against a throwaway DB only (`createdb tiffin_p2test` → `DATABASE_URL=...tiffin_p2test pnpm db:migrate` → applies clean → `dropdb tiffin_p2test`). Do NOT touch the shared `tiffin` DB.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.

```bash
git add apps/web/db/schema/app-settings.ts apps/web/db/migrations
git commit -m "feat(schema): app_settings.lead_assignment jsonb"
```

---

### Task 2: Lead source services + config getters

**Files:**
- Create: `apps/web/lib/services/lead-sources.service.ts`
- Modify: `apps/web/lib/services/app-settings.service.ts`

**Interfaces:**
- Produces: `leadSourceService`, `leadSubsourceService` (soft-delete on `active`); `getLeadAssignment(): Promise<LeadAssignmentConfig>`, `setLeadAssignment(cfg)`.

- [ ] **Step 1: Source services**

```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { leadSources, leadSubsources } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class SoftDeleteService<TTable extends PgTable> extends SessionUpdatableService<TTable> {
  async delete(id: string): Promise<number> { await this.update(id, { active: false }); return 1; }
}

export const leadSourceService = new SoftDeleteService(new UpdatableRepository(db, leadSources, leadSources.publicId, leadSources.id));
export const leadSubsourceService = new SoftDeleteService(new UpdatableRepository(db, leadSubsources, leadSubsources.publicId, leadSubsources.id));
```

- [ ] **Step 2: Config getters in app-settings.service.ts**

```ts
import type { LeadAssignmentConfig } from "./assignment";
const ASSIGNMENT_DEFAULT: LeadAssignmentConfig = { strategy: "creator", perSource: {}, weights: {}, cursor: {} };

export async function getLeadAssignment(): Promise<LeadAssignmentConfig> {
  const [row] = await db.select({ la: appSettings.leadAssignment }).from(appSettings).limit(1);
  return { ...ASSIGNMENT_DEFAULT, ...((row?.la as Partial<LeadAssignmentConfig>) ?? {}) };
}

export async function setLeadAssignment(cfg: LeadAssignmentConfig): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { leadAssignment: cfg });
  else await appSettingsEntity.create({ ...DEFAULTS, leadAssignment: cfg });
}
```

- [ ] **Step 3: Typecheck (will fail until Task 3 defines the types) — defer commit to Task 3.**

---

### Task 3: Pure assignment engine

**Files:**
- Create: `apps/web/lib/services/assignment.ts`
- Test: `apps/web/lib/services/__tests__/assignment.test.ts` (create)

**Interfaces:**
- Produces:
```ts
export type Strategy = "creator" | "round_robin" | "percentage";
export interface LeadAssignmentConfig {
  strategy: Strategy;
  perSource: Record<string, Strategy>;       // sourceKey -> override
  weights: Record<string, number>;            // userPublicId -> weight
  cursor: Record<string, string>;             // sourceKey -> last-assigned userPublicId
}
export interface PoolMember { id: bigint; publicId: string }
export interface PickResult { chosen: PoolMember | null; cursorPublicId: string | null }
export function strategyFor(cfg: LeadAssignmentConfig, sourceKey: string): Strategy;
export function pickAssignee(strategy: Strategy, pool: PoolMember[], cfg: LeadAssignmentConfig, sourceKey: string, roll: number): PickResult;
```
`roll` is a deterministic 0≤roll<1 the caller derives from the inquiry (no `Math.random` in the engine, so it is unit-testable).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { pickAssignee, strategyFor, type PoolMember, type LeadAssignmentConfig } from "../assignment";

const pool: PoolMember[] = [{ id: 1n, publicId: "a" }, { id: 2n, publicId: "b" }, { id: 3n, publicId: "c" }];
const base: LeadAssignmentConfig = { strategy: "round_robin", perSource: {}, weights: {}, cursor: {} };

describe("strategyFor", () => {
  it("uses per-source override when present", () => {
    expect(strategyFor({ ...base, strategy: "creator", perSource: { facebook: "round_robin" } }, "facebook")).toBe("round_robin");
  });
  it("falls back to global", () => {
    expect(strategyFor(base, "google")).toBe("round_robin");
  });
});

describe("round_robin", () => {
  it("starts at the first member when no cursor", () => {
    const r = pickAssignee("round_robin", pool, base, "google", 0);
    expect(r.chosen?.publicId).toBe("a");
    expect(r.cursorPublicId).toBe("a");
  });
  it("advances past the cursor", () => {
    const r = pickAssignee("round_robin", pool, { ...base, cursor: { google: "a" } }, "google", 0);
    expect(r.chosen?.publicId).toBe("b");
  });
  it("wraps around", () => {
    const r = pickAssignee("round_robin", pool, { ...base, cursor: { google: "c" } }, "google", 0);
    expect(r.chosen?.publicId).toBe("a");
  });
});

describe("percentage", () => {
  it("weights selection by configured weight (roll lands in b's band)", () => {
    const cfg: LeadAssignmentConfig = { ...base, strategy: "percentage", weights: { a: 1, b: 3 } };
    // a band [0,0.25), b band [0.25,1). roll 0.5 -> b
    expect(pickAssignee("percentage", pool, cfg, "x", 0.5).chosen?.publicId).toBe("b");
    expect(pickAssignee("percentage", pool, cfg, "x", 0.1).chosen?.publicId).toBe("a");
  });
});

describe("empty pool", () => {
  it("returns null chosen", () => {
    expect(pickAssignee("round_robin", [], base, "x", 0).chosen).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test assignment`
Expected: FAIL.

- [ ] **Step 3: Implement the engine**

```ts
export type Strategy = "creator" | "round_robin" | "percentage";
export interface LeadAssignmentConfig { strategy: Strategy; perSource: Record<string, Strategy>; weights: Record<string, number>; cursor: Record<string, string> }
export interface PoolMember { id: bigint; publicId: string }
export interface PickResult { chosen: PoolMember | null; cursorPublicId: string | null }

export function strategyFor(cfg: LeadAssignmentConfig, sourceKey: string): Strategy {
  return cfg.perSource[sourceKey] ?? cfg.strategy;
}

export function pickAssignee(strategy: Strategy, pool: PoolMember[], cfg: LeadAssignmentConfig, sourceKey: string, roll: number): PickResult {
  if (pool.length === 0) return { chosen: null, cursorPublicId: null };
  const sorted = [...pool].sort((a, b) => a.publicId.localeCompare(b.publicId));

  if (strategy === "percentage") {
    const weights = sorted.map((m) => Math.max(0, cfg.weights[m.publicId] ?? 1));
    const total = weights.reduce((s, w) => s + w, 0) || sorted.length;
    let acc = 0;
    const target = Math.min(0.999999, Math.max(0, roll)) * total;
    for (let i = 0; i < sorted.length; i++) {
      acc += weights[i] || 1;
      if (target < acc) return { chosen: sorted[i], cursorPublicId: sorted[i].publicId };
    }
    return { chosen: sorted[sorted.length - 1], cursorPublicId: sorted[sorted.length - 1].publicId };
  }

  // round_robin (and any non-creator default): advance past the stored cursor
  const last = cfg.cursor[sourceKey];
  const lastIdx = last ? sorted.findIndex((m) => m.publicId === last) : -1;
  const next = sorted[(lastIdx + 1) % sorted.length];
  return { chosen: next, cursorPublicId: next.publicId };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test assignment`
Expected: PASS.

- [ ] **Step 5: Typecheck both files + commit Tasks 2 & 3**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.

```bash
git add apps/web/lib/services/assignment.ts apps/web/lib/services/__tests__/assignment.test.ts apps/web/lib/services/lead-sources.service.ts apps/web/lib/services/app-settings.service.ts
git commit -m "feat(assignment): pure strategy engine + lead source services + config getters"
```

---

### Task 4: Wire `resolveOwner` to the engine

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-assignment.service.test.ts` (create)

**Interfaces:**
- Consumes: `getLeadAssignment`/`setLeadAssignment`, `pickAssignee`/`strategyFor`, `users` (acceptsLeads/inDefaultPool/isSystem).
- Produces: inbound `resolveOwner(sourceKey)` → eligible `acceptsLeads` pool → strategy pick → on empty, `inDefaultPool` pool → on empty, `usr_system`. Round-robin cursor persisted. `creator` strategy → the session actor (or system if none). Never null for inbound.

- [ ] **Step 1: Write the failing tests (live-DB harness, matching existing service tests)**

```ts
// Seed: 2 members with acceptsLeads=true, set leadAssignment strategy round_robin.
// Assert: two consecutive inbound creates assign to the two different members (cursor advances).
// Assert: with no acceptsLeads members but one inDefaultPool, inbound assigns to that member.
// Assert: with neither, inbound assigns to the isSystem user (never null).
// Clean up seeded users/config in afterAll.
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test inquiries-assignment`
Expected: FAIL.

- [ ] **Step 3: Replace `resolveOwner`**

`resolveOwner` now takes the `sourceKey` (thread it from `create`). Implementation:

```ts
private async resolveOwner(sourceKey: string, isInbound: boolean): Promise<bigint> {
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
  // eligible pool: acceptsLeads, else inDefaultPool
  const eligible = await this.pool({ acceptsLeads: true });
  const pool = eligible.length ? eligible : await this.pool({ inDefaultPool: true });
  if (!pool.length) return this.systemUserId();

  const roll = await this.rollFor();  // 0..1 deterministic-ish; see below
  const { chosen, cursorPublicId } = pickAssignee(strat, pool, cfg, sourceKey, roll);
  if (!chosen) return this.systemUserId();
  if (strat === "round_robin" && cursorPublicId) {
    await setLeadAssignment({ ...cfg, cursor: { ...cfg.cursor, [sourceKey]: cursorPublicId } });
  }
  return chosen.id;
}

private async pool(flag: { acceptsLeads?: boolean; inDefaultPool?: boolean }) {
  const col = flag.acceptsLeads ? users.acceptsLeads : users.inDefaultPool;
  return db.select({ id: users.id, publicId: users.publicId }).from(users).where(eq(col, true));
}
private async systemUserId(): Promise<bigint> {
  const [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  if (!sys) throw new Error("system user not seeded");
  return sys.id;
}
private async rollFor(): Promise<number> {
  // percentage strategy only; derive from current epoch ms fractional — adequate for weighting
  return (Date.now() % 1000) / 1000;
}
```

Update `create` to call `await this.resolveOwner(sourceKey, isInbound)` and type `currentOwner` as `bigint`. Add the `getLeadAssignment`/`setLeadAssignment`/`pickAssignee`/`strategyFor` imports.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test inquiries-assignment`
Expected: PASS. Also re-run `pnpm --filter web test inquiries-source-owner` (the Phase 0 system-fallback test) — adjust it if its expectation predated the pool (it should still pass for the no-pool → system case).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-assignment.service.test.ts
git commit -m "feat(inquiries): inbound owner resolution via assignment engine + pool fallback"
```

---

### Task 5: Source / sub-source admin CRUD (reuse catalog editor)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx` (supply leadSources options)
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/actions.ts`

**Interfaces:**
- Produces: `/dashboard/catalog/lead-sources` and `/dashboard/catalog/lead-subsources` typed editors; `isInbound` as a `boolean` Switch; sub-source `sourceId` as a dynamic `leadSources` select.

- [ ] **Step 1: Extend the field types + add the resource defs**

In `resource-config.ts`: add `"boolean"` to `FieldType`; add `"leadSources"` to `optionsSource`. Add defs:

```ts
"lead-sources": {
  key: "lead-sources", label: "Lead sources",
  fields: [
    { key: "key", label: "Key", type: "text" },
    { key: "label", label: "Label", type: "text" },
    { key: "isInbound", label: "Inbound (auto-assign)", type: "boolean" },
  ],
},
"lead-subsources": {
  key: "lead-subsources", label: "Lead sub-sources",
  fields: [
    { key: "sourceId", label: "Source", type: "select", optionsSource: "leadSources" },
    { key: "key", label: "Key", type: "text" },
    { key: "label", label: "Label", type: "text" },
  ],
},
```

In `rowToFields`/`fieldsToPatch` handle `boolean` (`String(v)` ↔ `raw === "true"`).

- [ ] **Step 2: Register the services**

In `catalog/actions.ts` add to `SERVICES`:

```ts
import { leadSourceService, leadSubsourceService } from "@/lib/services/lead-sources.service";
// ...
  "lead-sources": leadSourceService,
  "lead-subsources": leadSubsourceService,
```

- [ ] **Step 3: Editor renders boolean + dynamic options**

In `resource-editor.tsx` add a `boolean` branch rendering a `Switch`; when `optionsSource === "leadSources"`, read options from a new `leadSources` prop (`{ id, label }[]` mapped to `{ value: String(id), label }`). In `[resource]/page.tsx`, when the resource is `lead-subsources`, query active `leadSources` and pass them to the editor (mirror how `mealSlots`/`weekdays` options are already supplied).

- [ ] **Step 4: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.
Manual: `/dashboard/catalog/lead-sources` add/edit a source, toggle Inbound; `/dashboard/catalog/lead-subsources` add one under a chosen source.

```bash
git add apps/web/app/\(dashboard\)/dashboard/catalog
git commit -m "feat(admin): lead source + sub-source typed CRUD"
```

---

### Task 6: Lead-assignment settings page

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/settings/lead-assignment/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/settings/lead-assignment/form.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/settings/lead-assignment/actions.ts`

**Interfaces:**
- Consumes: `getLeadAssignment`/`setLeadAssignment`, active `leadSources`, staff users with `acceptsLeads`.
- Produces: admin form to set global strategy, per-source overrides, and percentage weights per accepts-leads member.

- [ ] **Step 1: Action**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setLeadAssignment } from "@/lib/services/app-settings.service";
import type { LeadAssignmentConfig } from "@/lib/services/assignment";

export async function saveLeadAssignment(cfg: LeadAssignmentConfig) {
  await requireAdmin();
  await setLeadAssignment(cfg);
  revalidatePath("/dashboard/settings/lead-assignment");
}
```

- [ ] **Step 2: Page loads config + sources + pool**

Server component (`requireAdmin`): load `getLeadAssignment()`, active `leadSources` (key+label+isInbound), and `acceptsLeads` users (publicId+name). Render `<LeadAssignmentForm cfg sources members />` inside `PageShell`/`SectionCard`.

- [ ] **Step 3: Form (client, RHF optional — plain state is fine here)**

- Global strategy `Select` (`creator`/`round_robin`/`percentage`).
- Per inbound source: a `Select` override (Default / creator / round_robin / percentage).
- Per accepts-leads member: a numeric weight `Input` (used by percentage).
- Submit builds `LeadAssignmentConfig` (preserve existing `cursor`) and calls `saveLeadAssignment`.

- [ ] **Step 4: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.
Manual: set round_robin globally, override facebook→percentage, set weights; reload shows persisted values.

```bash
git add apps/web/app/\(dashboard\)/dashboard/settings/lead-assignment
git commit -m "feat(admin): lead-assignment strategy + weights settings"
```

---

### Task 7: Accept-leads / default-pool toggles in users admin

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/users/user-row.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/users/actions.ts` (create if absent)
- Modify: `apps/web/app/(dashboard)/dashboard/users/page.tsx` (include the flags + only staff)

**Interfaces:**
- Produces: per-staff `acceptsLeads` + `inDefaultPool` `Switch`es; `setLeadFlags(userPublicId, { acceptsLeads?, inDefaultPool? })` action (admin-guarded). Customers (`role="user"`) are not shown these toggles.

- [ ] **Step 1: Action**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function setLeadFlags(userPublicId: string, flags: { acceptsLeads?: boolean; inDefaultPool?: boolean }) {
  await requireAdmin();
  await db.update(users).set(flags).where(eq(users.publicId, userPublicId));
  revalidatePath("/dashboard/users");
}
```

(Direct update is acceptable here — these are admin-only operational flags, not audited entity fields; matches the existing flags-toggle pattern in this page.)

- [ ] **Step 2: Page passes the flags**

In `users/page.tsx`, include `acceptsLeads`/`inDefaultPool`/`role` in the `users` select and pass to `UserRow`.

- [ ] **Step 3: Row renders Switches for staff**

In `user-row.tsx`, when `user.role !== "user"`, render two `Switch`es bound to `setLeadFlags`; for customers render "—".

- [ ] **Step 4: Typecheck + manual + commit**

Run: `pnpm --filter web exec tsc --noEmit` → PASS.
Manual: toggle a member's Accepts-leads; create an inbound inquiry → it routes to that member per strategy.

```bash
git add apps/web/app/\(dashboard\)/dashboard/users
git commit -m "feat(admin): accepts-leads + default-pool toggles per staff"
```

---

## Self-Review

**Spec coverage (Phase 2 build-order rows):**
- Admin CRUD for sources/sub-sources + isInbound toggle → Task 5 ✓
- `app_settings.leadAssignment` config UI (strategy per source, round-robin/percentage, weights) → Tasks 1, 6 ✓
- `acceptsLeads`/`inDefaultPool` management → Task 7 ✓
- `resolveOwner` runs the engine on inbound create (pool → default-pool → system) → Tasks 3, 4 ✓

**Placeholder scan:** logic-bearing parts (engine, resolveOwner, config getters, schema) carry full code + tests; the three admin UIs reuse the existing catalog editor / users-row patterns and specify exact fields, services, and props rather than re-printing the shared components. No "TODO"/"add validation"/"similar to".

**Type consistency:** `LeadAssignmentConfig`/`Strategy`/`PoolMember`/`PickResult` defined in Task 3, consumed identically in Tasks 2, 4, 6. `strategyFor`/`pickAssignee` signatures match across engine + caller. `setLeadFlags` shape consistent between Task 7 action and row.

**Caveat to surface:** Task 1 regenerates the squashed baseline again. Local dev uses the non-destructive ALTER (no data loss); the canonical baseline is verified only against a throwaway DB. The `percentage` `roll` derivation (`rollFor`) is intentionally simple (epoch-fraction) — adequate for weighting; a per-inquiry deterministic hash can replace it later if reproducibility matters.

---

## Execution Handoff

Phase 2 executes via an **ultracode workflow**, same shape as Phases 0–1: sequential agents on the shared tree (engine/service before UI), `tsc`+`vitest` verify gate (ignoring `next-id`), final adversarial review against this plan + the spec. Task 1 touches the DB — the workflow runs the non-destructive ALTER on the local DB and verifies the regenerated baseline only against a throwaway DB (never wiping `tiffin`).
