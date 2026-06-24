# Inquiry CRM Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the schema + service foundation for the inquiry CRM revamp — actor stamping, owner columns, configurable lead sources, a system fallback user, and the activity/prefs fields — so Phases 1–3 build on stable columns with no re-migration.

**Architecture:** Drizzle schema changes regenerate the single squashed baseline migration (the `next_id()` preamble is re-prepended by hand per house rule). The enum→FK swap for inquiry source is absorbed in `inquiriesService` (call sites keep passing string keys). Actor stamping is two lines in the existing session-service base classes; the columns already exist.

**Tech Stack:** Next.js (non-stock — read `node_modules/next/dist/docs/` before UI work), Drizzle ORM + drizzle-kit, PostgreSQL, `@tiffin/commons` + `@tiffin/commons-drizzle`, Vitest, tsx seeds.

## Global Constraints

- Shared code lives in `@tiffin/commons{,-drizzle,-next}`, not `apps/web` (TD-1).
- All writes go through commons abstract services; subclass + `super` (no raw service bypass).
- Epoch-ms storage for timestamps; `next_id()` snowflake bigint PKs + prefixed nanoid `public_id`.
- Migrations are squashed to ONE baseline (`apps/web/db/migrations/0000_baseline.sql`); regenerate via `db:generate`, then hand-prepend the `next_id()` preamble.
- Better-Auth tables (`session`/`account`/`verification`) are excluded from owner/actor columns.
- No new npm dependencies.
- Run commands from `apps/web` unless noted. Tests: `pnpm --filter web test <path>`.

---

### Task 1: Stamp `createdBy`/`updatedBy` from session into rows

**Files:**
- Modify: `apps/web/lib/services/session-service.ts`
- Test: `apps/web/lib/services/__tests__/session-stamp.service.test.ts` (create)

**Interfaces:**
- Consumes: `BaseService.create`, `UpdatableService.update` (commons-drizzle), `currentUserId(): Promise<bigint|null>`.
- Produces: rows persisted with `createdBy` set on create, `updatedBy` set on update, both from the session actor; `null` when no session.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const created: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

vi.mock("@tiffin/commons-drizzle", async (orig) => {
  const actual = await orig<typeof import("@tiffin/commons-drizzle")>();
  class FakeBase {
    repo = { tableName: "widgets" };
    async create(v: Record<string, unknown>) { created.push(v); return { publicId: "wid_1", ...v }; }
  }
  class FakeUpd extends FakeBase {
    async update(_id: string, v: Record<string, unknown>) { updated.push(v); return { publicId: "wid_1", ...v }; }
    async delete() { return 1; }
  }
  return { ...actual, BaseService: FakeBase, UpdatableService: FakeUpd };
});

import { SessionUpdatableService } from "../session-service";

class Widgets extends SessionUpdatableService<any> {
  protected currentUserId() { return Promise.resolve(42n); }
}

describe("session stamping", () => {
  beforeEach(() => { created.length = 0; updated.length = 0; });

  it("stamps createdBy on create", async () => {
    const svc = new Widgets({ tableName: "widgets" } as any);
    await svc.create({ name: "x" });
    expect(created[0]).toMatchObject({ name: "x", createdBy: 42n });
  });

  it("stamps updatedBy on update", async () => {
    const svc = new Widgets({ tableName: "widgets" } as any);
    await svc.update("wid_1", { name: "y" });
    expect(updated[0]).toMatchObject({ name: "y", updatedBy: 42n });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test session-stamp`
Expected: FAIL — `createdBy`/`updatedBy` absent from captured values.

- [ ] **Step 3: Implement stamping**

In `session-service.ts`, in BOTH `SessionBaseService.create` and `SessionUpdatableService.create`, resolve the actor once and inject it before calling super:

```ts
async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
  const actorId = await this.currentUserId();
  const row = await super.create({ ...values, createdBy: actorId });
  await recordAudit({
    entity: this.repo.tableName,
    entityPublicId: (row as { publicId: string }).publicId,
    operation: "create",
    changes: stripManaged(values),
    createdBy: actorId,
  });
  return row;
}
```

In `SessionUpdatableService.update`, stamp `updatedBy`:

```ts
async update(publicId: string, patch: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
  const actorId = await this.currentUserId();
  const row = await super.update(publicId, { ...patch, updatedBy: actorId });
  await recordAudit({
    entity: this.repo.tableName,
    entityPublicId: (row as { publicId: string }).publicId,
    operation: "update",
    changes: this.auditChanges(patch),
    createdBy: actorId,
  });
  return row;
}
```

Note: `stripManaged`/`auditChanges` still receive the original `values`/`patch` (without the injected audit field), so the audit `changes` blob stays clean. `createdBy` is in `CREATE_ONLY_FIELDS`, so an update patch never carries it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test session-stamp`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/session-service.ts apps/web/lib/services/__tests__/session-stamp.service.test.ts
git commit -m "feat(services): stamp createdBy/updatedBy from session into rows"
```

---

### Task 2: Add pool + system flags to `users`

**Files:**
- Modify: `apps/web/db/schema/auth.ts:9-29`

**Interfaces:**
- Produces: `users.acceptsLeads: boolean`, `users.inDefaultPool: boolean`, `users.isSystem: boolean` — all default false.

- [ ] **Step 1: Add the columns**

In `auth.ts`, inside the `users` table object after `pinAttempts`:

```ts
    acceptsLeads: boolean("accepts_leads").notNull().default(false),
    inDefaultPool: boolean("in_default_pool").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
```

(`boolean` is already imported.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS (no usages yet).

- [ ] **Step 3: Commit**

```bash
git add apps/web/db/schema/auth.ts
git commit -m "feat(schema): users accepts_leads/in_default_pool/is_system flags"
```

---

### Task 3: Lead source reference tables

**Files:**
- Create: `apps/web/db/schema/lead-sources.ts`
- Modify: `apps/web/db/schema/index.ts`

**Interfaces:**
- Produces: `leadSources` (`key`, `label`, `isInbound`, `active`), `leadSubsources` (`sourceId`→leadSources, `key`, `label`, `active`). Both on `updatableColumns`.

- [ ] **Step 1: Create the schema file**

```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { bigint, boolean, index, pgTable, text } from "drizzle-orm/pg-core";

export const leadSources = pgTable("lead_sources", {
  ...updatableColumns("lsr"),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  isInbound: boolean("is_inbound").notNull().default(true),
  active: boolean("active").notNull().default(true),
});

export const leadSubsources = pgTable("lead_subsources", {
  ...updatableColumns("lss"),
  sourceId: bigint("source_id", { mode: "bigint" }).notNull().references(() => leadSources.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [index("lead_subsources_source_idx").on(t.sourceId)]);
```

- [ ] **Step 2: Export from index**

Add to `apps/web/db/schema/index.ts`:

```ts
export * from "./lead-sources";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/schema/lead-sources.ts apps/web/db/schema/index.ts
git commit -m "feat(schema): lead_sources + lead_subsources reference tables"
```

---

### Task 4: Inquiries — owner rename, source FKs, prefs, lost reason

**Files:**
- Modify: `apps/web/db/schema/inquiries.ts`

**Interfaces:**
- Produces: `inquiries.currentOwner` (was `assignedTo`), `inquiries.sourceId`→leadSources, `inquiries.subSourceId`→leadSubsources (null), prefs columns, `inquiries.lostReason` enum (null); `prefs` jsonb removed; `inquiry_source` enum removed.

- [ ] **Step 1: Rewrite the inquiries table**

Replace the `inquirySource` enum line and the `inquiries` table body. Remove `inquirySource`; add `inquiryLostReason`. New imports: add `date`, `numeric`, `integer`, keep `bigint`, `index`, `pgEnum`, `pgTable`, `text`; drop `jsonb` if now unused (it is — remove it). Import `leadSources`, `leadSubsources` from `./lead-sources`.

```ts
import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { sql } from "drizzle-orm";
import { bigint, date, index, integer, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";
import { leadSources, leadSubsources } from "./lead-sources";
import { deliveryZones } from "./catalog";

export const inquiryStage = pgEnum("inquiry_stage", ["new", "contacted", "follow_up", "converted", "lost"]);
export const inquiryActivityType = pgEnum("inquiry_activity_type", [
  "created", "note", "stage_change", "converted", "call", "whatsapp", "email",
]);
export const inquiryLostReason = pgEnum("inquiry_lost_reason", [
  "price", "out_of_zone", "no_response", "chose_competitor", "not_ready", "other",
]);

export const inquiries = pgTable("inquiries", {
  ...updatableColumns("inq"),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  sourceId: bigint("source_id", { mode: "bigint" }).notNull().references(() => leadSources.id),
  subSourceId: bigint("sub_source_id", { mode: "bigint" }).references(() => leadSubsources.id),
  stage: inquiryStage("stage").notNull().default("new"),
  currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id),
  convertedOrderId: bigint("converted_order_id", { mode: "bigint" }).references(() => orders.id),
  planInterest: text("plan_interest"),
  mealSizeInterest: text("meal_size_interest"),
  personsInterest: integer("persons_interest"),
  postalCode: text("postal_code"),
  zoneId: bigint("zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
  preferredStart: date("preferred_start"),
  quotedPrice: numeric("quoted_price", { precision: 10, scale: 2 }),
  lostReason: inquiryLostReason("lost_reason"),
  notes: text("notes"),
}, (t) => [
  index("inquiries_phone_lower_idx").on(sql`lower(${t.phone})`),
  index("inquiries_email_lower_idx").on(sql`lower(${t.email})`),
  index("inquiries_owner_idx").on(t.currentOwner),
]);
```

- [ ] **Step 2: Extend the activities table (outcome + next follow-up)**

Replace the `inquiryActivities` table with:

```ts
export const inquiryActivities = pgTable("inquiry_activities", {
  ...baseColumns("iac"),
  inquiryId: bigint("inquiry_id", { mode: "bigint" }).notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  type: inquiryActivityType("type").notNull(),
  note: text("note"),
  outcome: text("outcome"),
  nextFollowUpAt: bigint("next_follow_up_at", { mode: "number" }),
  fromStage: inquiryStage("from_stage"),
  toStage: inquiryStage("to_stage"),
});
```

- [ ] **Step 3: Typecheck (expect failures in dependents)**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: FAIL — `inquiriesService` and call sites still reference `source`/`assignedTo`. These are fixed in Tasks 8 & 10. Note the failing files; proceed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/schema/inquiries.ts
git commit -m "feat(schema): inquiries owner rename, source FKs, prefs, lost reason, activity fields"
```

---

### Task 5: Orders — add `currentOwner`

**Files:**
- Modify: `apps/web/db/schema/orders.ts:12-37`

**Interfaces:**
- Produces: `orders.currentOwner: bigint → users.id` (null).

- [ ] **Step 1: Add the column**

In the `orders` table, after `userId`:

```ts
  currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: same dependents failing as Task 4; no NEW errors in orders.

- [ ] **Step 3: Commit**

```bash
git add apps/web/db/schema/orders.ts
git commit -m "feat(schema): orders.current_owner"
```

---

### Task 6: Regenerate the squashed baseline migration

**Files:**
- Replace: `apps/web/db/migrations/0000_baseline.sql`
- Replace: `apps/web/db/migrations/meta/*`

**Interfaces:**
- Consumes: the full schema after Tasks 2–5.
- Produces: a single regenerated baseline whose first statements are the `next_id()` preamble.

- [ ] **Step 1: Capture the preamble**

The `next_id()` preamble is everything in the current `0000_baseline.sql` from the top through the `CREATE OR REPLACE FUNCTION next_id ... LANGUAGE plpgsql;--> statement-breakpoint` line (the `CREATE SEQUENCE id_seq` + the function). Copy that block to `apps/web/db/migrations/_preamble.sql.txt` temporarily.

- [ ] **Step 2: Clear and regenerate**

```bash
cd apps/web
rm -rf db/migrations/0000_baseline.sql db/migrations/meta
pnpm db:generate
```

drizzle-kit writes a fresh `0000_*.sql` + `meta/`. Rename the generated SQL to `0000_baseline.sql` if drizzle named it otherwise.

- [ ] **Step 3: Re-prepend the preamble**

Prepend the captured preamble block (Step 1) to the top of `0000_baseline.sql` so `next_id()` exists before any table using `default next_id()` is created. Delete `_preamble.sql.txt`.

- [ ] **Step 4: Verify it applies against a scratch DB**

```bash
pnpm db:migrate
```

Expected: applies cleanly, no "function next_id() does not exist" error. Confirm `lead_sources`, `lead_subsources` exist and `inquiries` has `source_id`, `current_owner`, `lost_reason`; `inquiry_source` type is gone.

- [ ] **Step 5: Commit**

```bash
git add apps/web/db/migrations
git commit -m "chore(db): regenerate squashed baseline with CRM foundation columns"
```

---

### Task 7: Seed lead sources + sub-sources

**Files:**
- Create: `apps/web/db/seed-sources.ts`
- Modify: `apps/web/package.json` (scripts) and `apps/web/db/seed.ts` (call it from the umbrella seed)

**Interfaces:**
- Produces: idempotent seed of sources `manual`(isInbound=false), `referral`, `website`, `google`, `facebook`, `instagram`; sub-sources `facebook_feed`, `facebook_ads` (under facebook), `instagram_reels` (under instagram).

- [ ] **Step 1: Write the seed**

```ts
import { eq } from "drizzle-orm";
import { db } from "./client";
import { leadSources, leadSubsources } from "./schema";

const SOURCES = [
  { key: "manual", label: "Manual", isInbound: false },
  { key: "referral", label: "Referral", isInbound: true },
  { key: "website", label: "Website", isInbound: true },
  { key: "google", label: "Google", isInbound: true },
  { key: "facebook", label: "Facebook", isInbound: true },
  { key: "instagram", label: "Instagram", isInbound: true },
];

const SUBSOURCES: Record<string, { key: string; label: string }[]> = {
  facebook: [
    { key: "facebook_feed", label: "Facebook Feed" },
    { key: "facebook_ads", label: "Facebook Ads" },
  ],
  instagram: [{ key: "instagram_reels", label: "Instagram Reels" }],
};

export async function seedLeadSources() {
  for (const s of SOURCES) {
    const [existing] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, s.key)).limit(1);
    const sourceId = existing?.id
      ?? (await db.insert(leadSources).values(s).returning({ id: leadSources.id }))[0].id;
    for (const sub of SUBSOURCES[s.key] ?? []) {
      const [subExists] = await db.select({ id: leadSubsources.id }).from(leadSubsources).where(eq(leadSubsources.key, sub.key)).limit(1);
      if (!subExists) await db.insert(leadSubsources).values({ ...sub, sourceId });
    }
  }
  console.log("Seeded lead sources + sub-sources");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedLeadSources().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Wire into umbrella seed + add script**

Add to `package.json` scripts: `"db:seed:sources": "tsx db/seed-sources.ts"`. In `db/seed.ts`, import and `await seedLeadSources()` before any inquiry seed.

- [ ] **Step 3: Run it (idempotent)**

```bash
pnpm db:seed:sources && pnpm db:seed:sources
```

Expected: second run inserts nothing new (no unique-violation errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/seed-sources.ts apps/web/db/seed.ts apps/web/package.json
git commit -m "feat(seed): default lead sources + sub-sources"
```

---

### Task 8: Seed the system fallback user

**Files:**
- Modify: `apps/web/db/seed-admin.ts`

**Interfaces:**
- Produces: a single `users` row with `isSystem=true`, `role="admin"`, no credential account (cannot log in). Idempotent.

- [ ] **Step 1: Add the seeder**

In `seed-admin.ts`, add:

```ts
async function seedSystemUser() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  if (existing) { console.log("system user already exists"); return; }
  await db.insert(users).values({
    name: "System",
    email: "system@tiffingrab.internal",
    role: "admin",
    isSystem: true,
  });
  console.log("Seeded system user (no login)");
}
```

Call it first in `main()`: `await seedSystemUser();`

- [ ] **Step 2: Run + verify single instance**

```bash
pnpm db:seed:admin && pnpm db:seed:admin
```

Expected: "system user already exists" on the second run; exactly one `is_system=true` row.

- [ ] **Step 3: Commit**

```bash
git add apps/web/db/seed-admin.ts
git commit -m "feat(seed): system fallback user (unloginnable)"
```

---

### Task 9: Resolve source keys + assign owner in `inquiriesService.create`

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-source-owner.service.test.ts` (create)

**Interfaces:**
- Consumes: `leadSources`, `leadSubsources`, `users` (isSystem), session actor via `currentUserId()`.
- Produces: `create(values)` accepts `{ sourceKey: string, subSourceKey?: string }` (instead of `source`), resolves them to `sourceId`/`subSourceId`; sets `currentOwner` = creator when the source is `isInbound=false`, else the system user (Phase 1 simple rule); throws `ValidationError` on unknown source key.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock db with a query stub keyed by table; see existing inquiries.service.test.ts for the
// pattern. Assert: unknown sourceKey throws ValidationError; manual source → currentOwner = actor id;
// inbound source with no actor → currentOwner = system user id.
```

(Model the db mock on `apps/web/lib/services/__tests__/inquiries.service.test.ts`. Cover three cases: unknown-source throw, manual→creator, inbound→system.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test inquiries-source-owner`
Expected: FAIL.

- [ ] **Step 3: Implement resolution + ownership**

In `inquiries.service.ts`, add imports for `leadSources`, `leadSubsources`, and a helper, then rewrite `create`:

```ts
private async resolveSource(sourceKey: string, subSourceKey?: string) {
  const [src] = await db.select({ id: leadSources.id, isInbound: leadSources.isInbound })
    .from(leadSources).where(eq(leadSources.key, sourceKey)).limit(1);
  if (!src) throw new ValidationError(`Unknown lead source: ${sourceKey}`);
  let subSourceId: bigint | null = null;
  if (subSourceKey) {
    const [sub] = await db.select({ id: leadSubsources.id })
      .from(leadSubsources).where(eq(leadSubsources.key, subSourceKey)).limit(1);
    subSourceId = sub?.id ?? null;
  }
  return { sourceId: src.id, subSourceId, isInbound: src.isInbound };
}

private async resolveOwner(isInbound: boolean): Promise<bigint | null> {
  if (!isInbound) return this.currentUserId();
  const [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  return sys?.id ?? null;
}

async create(values: Record<string, unknown>) {
  const parsedPhone = phoneSchema().safeParse(values.phone);
  if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
  const parsedEmail = values.email ? emailSchema.safeParse(values.email) : null;
  if (parsedEmail && !parsedEmail.success) throw new ValidationError("Enter a valid email");

  const { sourceKey, subSourceKey, ...rest } = values as {
    sourceKey: string; subSourceKey?: string; [k: string]: unknown;
  };
  const { sourceId, subSourceId, isInbound } = await this.resolveSource(sourceKey, subSourceKey);
  const currentOwner = await this.resolveOwner(isInbound);

  const inq = await super.create({
    ...rest,
    phone: parsedPhone.data,
    ...(parsedEmail ? { email: parsedEmail.data } : {}),
    sourceId,
    subSourceId,
    currentOwner,
  });
  await inquiryActivitiesService.create({ inquiryId: inq.id, type: "created", toStage: inq.stage });
  return inq;
}
```

Add `users` to the existing `@/db/schema` import.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test inquiries-source-owner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-source-owner.service.test.ts
git commit -m "feat(inquiries): resolve source keys to FKs + assign owner with system fallback"
```

---

### Task 10: Update call sites to the new `sourceKey` contract

**Files:**
- Modify: `apps/web/app/(marketing)/contact/actions.ts` (website inquiry → `sourceKey: "website"`)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts` (manual create → `sourceKey` from form)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/inquiry-schema.ts` (`source` → `sourceKey`)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` (field rename; keep static SOURCES list for now — admin source CRUD is Phase 2)
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/page.tsx` and `inquiries-list.tsx` (read `inq.sourceId`/joined label instead of `inq.source`; display a resolved label — join `leadSources` in the list/detail query)
- Modify: tests under `apps/web/lib/services/__tests__/` that pass `source:` (`inquiries.service.test.ts`, `inquiries-convert.test.ts`, `audit.service.test.ts`, `customer360.service.test.ts`) and `apps/web/app/(marketing)/contact/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `inquiriesService.create({ ..., sourceKey, subSourceKey? })` from Task 9.
- Produces: a green typecheck + test run across the whole app.

- [ ] **Step 1: Mechanical swap**

Everywhere an inquiry is created, replace `source: "<x>"` with `sourceKey: "<x>"`. In `inquiry-schema.ts` rename the field `source` → `sourceKey` (keep `z.string().min(1)`). In `new-inquiry-form.tsx` rename the form field and its `Select` binding `source` → `sourceKey`. For display in `[id]/page.tsx` and `inquiries-list.tsx`, join `leadSources` on `sourceId` in the read query and render `source.label` (the inquiry no longer has a `source` string).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS (all dependents resolved).

- [ ] **Step 3: Full test run**

Run: `pnpm --filter web test`
Expected: PASS. Fix any test still passing `source:` to use `sourceKey:`.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "refactor(inquiries): migrate call sites to sourceKey contract"
```

---

### Task 11: Convert carries owner to the order

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts` (`convert`)
- Test: `apps/web/lib/services/__tests__/inquiries-convert.test.ts` (extend)

**Interfaces:**
- Consumes: `inquiries.currentOwner`, `orders.currentOwner`.
- Produces: on convert, the created order's `currentOwner` = the inquiry's `currentOwner`.

- [ ] **Step 1: Write the failing assertion**

Extend the convert test to assert the order is created with `currentOwner` equal to the inquiry's `currentOwner`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test inquiries-convert`
Expected: FAIL.

- [ ] **Step 3: Pass the owner through**

In `convert`, read the inquiry's `currentOwner` and pass it into the `createOrder` input (extend `CreateOrderInput` / the order insert to set `currentOwner`). Keep the existing `createOrder` signature stable by threading `currentOwner` via the order values.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test inquiries-convert`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-convert.test.ts
git commit -m "feat(inquiries): carry owner from inquiry to converted order"
```

---

## Self-Review

**Spec coverage (Phase 0 rows of the build order):**
- Stamp createdBy/updatedBy → Task 1 ✓
- users pool flags + system user → Tasks 2, 8 ✓
- lead_sources/lead_subsources + seed + drop source enum → Tasks 3, 7, 4 ✓
- inquiries owner rename + source FKs + prefs + lostReason + drop prefs → Task 4 ✓
- orders currentOwner → Task 5 ✓
- inquiry_activities enum + outcome + nextFollowUpAt → Task 4 (step 2) ✓
- regenerate squashed baseline → Task 6 ✓
- owner carried on convert → Task 11 ✓ (foundation-adjacent; keeps convert green after rename)

**Deferred to later phases (correctly NOT in Phase 0):** intake prefs UI, typed activity timeline UI, conversion drawer, rules engine, admin source CRUD, sorting.

**Placeholder scan:** Task 9 Step 1 and Task 10 reference an existing test as the mock pattern rather than repeating ~40 lines of db-mock boilerplate — the pattern file is named exactly; acceptable. All schema/service/seed steps carry full code.

**Type consistency:** `sourceKey`/`subSourceKey` (service input) vs `sourceId`/`subSourceId` (columns) used consistently across Tasks 4, 9, 10. `currentOwner` used identically in Tasks 4, 5, 11. `isSystem` defined in Task 2, queried in Tasks 8, 9.

---

## Execution Handoff

Per user direction, Phase 0 executes via an **ultracode workflow** (multi-agent), not inline. Tasks 1–11 are mostly sequential (schema → migration → seed → service), so the workflow pipelines the independent legs (Tasks 2/3/5 schema edits can fan out) and serializes the migration/seed/service chain, with a verify gate (`tsc --noEmit` + `pnpm --filter web test`) before the final commit.
