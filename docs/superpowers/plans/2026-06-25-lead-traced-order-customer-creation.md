# Lead-traced Order & Customer creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let salespeople create an order or a customer directly, each born from an inquiry that carries the source, with live phone-based inquiry dedup.

**Architecture:** Inquiry stays the lead-of-record. Two backend helpers (`findOpenByPhone`, `resolveForSource`) and a shared customer-provisioning extraction compose with the existing `convert()`/`createOrder()` path. Two new client sheets (New Order, New Customer) share one `<InquiryMatch>` widget. No new domain concepts.

**Tech Stack:** Next.js (vendored — read `node_modules/next/dist/docs/` before touching framework APIs), React Server Components + server actions, Drizzle ORM, Postgres, react-hook-form + zod, shadcn/ui, Vitest (live-DB harness).

## Global Constraints

- Shared/reusable logic belongs in services, not components (TD-1; commons rule applies to cross-app code only — this is app-local).
- All writes go through services that stamp `createdBy`/`updatedBy` from the session (services-extend-commons convention).
- Service tests hit the real seeded Postgres. Never delete the shared `usr_system` fixture. Run with the documented env-file harness.
- Staff times IST, customer times Canada; epoch-ms storage (not relevant to new code but don't regress).
- No Co-Authored-By trailer in commits. Plain commit messages.
- Source must be captured on every create path; an inquiry must always back an order/customer.
- "Open" inquiry = stage NOT in (`converted`, `lost`).

---

### Task 1: `inquiriesService.findOpenByPhone(phone)`

Live lookup powering the match list.

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-find-by-phone.service.test.ts`

**Interfaces:**
- Consumes: existing `inquiriesService.create(values)`, `inquiriesService.changeStage(publicId, stage)`.
- Produces: `findOpenByPhone(phone: string): Promise<OpenInquiryMatch[]>` where
  `type OpenInquiryMatch = { publicId: string; sourceKey: string; sourceLabel: string; stage: Stage; createdAt: number }`. Newest first. Excludes `converted` and `lost`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/lib/services/__tests__/inquiries-find-by-phone.service.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}

describe("inquiriesService.findOpenByPhone", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns open inquiries for a phone, newest first, with source key+label", async () => {
    const phone = "+16475552000";
    await inquiriesService.create({ fullName: "Lead A", phone, sourceKey: "facebook" });
    await inquiriesService.create({ fullName: "Lead A2", phone, sourceKey: "manual" });
    const rows = await inquiriesService.findOpenByPhone(phone);
    expect(rows).toHaveLength(2);
    expect(rows[0].sourceKey).toBe("manual"); // newest first
    expect(rows[0].sourceLabel).toBeTruthy();
    expect(rows[0].stage).toBe("new");
  });

  it("excludes converted and lost inquiries", async () => {
    const phone = "+16475552001";
    const open = await inquiriesService.create({ fullName: "Open", phone, sourceKey: "facebook" });
    const lost = await inquiriesService.create({ fullName: "Lost", phone, sourceKey: "manual" });
    await inquiriesService.markLost(lost.publicId, "no_response");
    const rows = await inquiriesService.findOpenByPhone(phone);
    expect(rows.map((r) => r.publicId)).toEqual([open.publicId]);
  });

  it("returns empty for an unknown phone", async () => {
    expect(await inquiriesService.findOpenByPhone("+16470000000")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test:run lib/services/__tests__/inquiries-find-by-phone.service.test.ts` (use the project's documented env-file test command; check `apps/web/package.json` scripts).
Expected: FAIL — `findOpenByPhone is not a function`.

- [ ] **Step 3: Implement `findOpenByPhone`**

Add to `InquiriesService` (after `listActivities`). Confirm `leadSources` is imported in this file; the page already joins it, but check the service's imports and add `leadSources`, `notInArray` (drizzle-orm) if missing.

```typescript
async findOpenByPhone(phone: string): Promise<
  { publicId: string; sourceKey: string; sourceLabel: string; stage: Stage; createdAt: number }[]
> {
  const rows = await db
    .select({
      publicId: inquiries.publicId,
      sourceKey: leadSources.key,
      sourceLabel: leadSources.label,
      stage: inquiries.stage,
      createdAt: inquiries.createdAt,
    })
    .from(inquiries)
    .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
    .where(
      and(
        eq(sql`lower(${inquiries.phone})`, phone.toLowerCase()),
        notInArray(inquiries.stage, ["converted", "lost"]),
      ),
    )
    .orderBy(desc(inquiries.createdAt));
  return rows as { publicId: string; sourceKey: string; sourceLabel: string; stage: Stage; createdAt: number }[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command. Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-find-by-phone.service.test.ts
git commit -m "feat(inquiries): findOpenByPhone for live dedup lookup"
```

---

### Task 2: Extract `provisionCustomerByPhone` + add `customersService.create`

Deduplicate the inline user+account provisioning in `createOrder` and expose a customer-only path.

**Files:**
- Modify: `apps/web/lib/services/orders.service.ts` (extract block ~lines 96–122)
- Modify: `apps/web/lib/services/customers.service.ts` (add helper + `create`)
- Test: `apps/web/lib/services/__tests__/customers-create.service.test.ts`

**Interfaces:**
- Produces (in `customers.service.ts`):
  - `provisionCustomerByPhone(tx: Tx, contact: { fullName: string; phone: string; email: string | null }, createdBy: bigint | null): Promise<bigint>` — returns the internal `users.id`; finds by phone, inserts user + credential account when absent, guards email clash, handles the onConflict race. `Tx` = the transaction handle type used in `createOrder` (`Parameters<Parameters<typeof db.transaction>[0]>[0]`).
  - `createCustomer(contact: { fullName: string; phone: string; email?: string }, opts: { actorId?: string | null }): Promise<{ publicId: string }>` — parses phone/email, opens a tx, provisions, returns the customer `publicId`. Idempotent by phone.
- Consumes: existing `hashPassword`, `TEMP_PASSWORD`, `phoneSchema`, `emailSchema`, `account`, `users` — import the same ones `orders.service.ts` uses.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/lib/services/__tests__/customers-create.service.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createCustomer } = await import("../customers.service");

const PHONE = "+16475553000";

async function cleanup() {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.phone, PHONE));
  for (const r of rows) {
    await db.delete(account).where(eq(account.userId, r.id));
    await db.delete(users).where(eq(users.id, r.id));
  }
}

describe("createCustomer", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("provisions a user + credential account and returns a publicId", async () => {
    const { publicId } = await createCustomer({ fullName: "Walk In", phone: PHONE }, {});
    expect(publicId).toMatch(/^usr_/);
    const [u] = await db.select().from(users).where(eq(users.publicId, publicId));
    expect(u.role).toBe("user");
    const [acc] = await db.select().from(account).where(eq(account.userId, u.id));
    expect(acc.providerId).toBe("credential");
  });

  it("is idempotent by phone — second call returns the same customer", async () => {
    const first = await createCustomer({ fullName: "Walk In", phone: PHONE }, {});
    const second = await createCustomer({ fullName: "Walk In Again", phone: PHONE }, {});
    expect(second.publicId).toBe(first.publicId);
    const n = await db.select({ id: users.id }).from(users).where(eq(users.phone, PHONE));
    expect(n).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test:run lib/services/__tests__/customers-create.service.test.ts`
Expected: FAIL — `createCustomer is not exported`.

- [ ] **Step 3: Add the helper + `createCustomer` to `customers.service.ts`**

First read `orders.service.ts` lines 59–122 to copy the exact provisioning logic and its imports (`account`, `hashPassword`, `TEMP_PASSWORD`, `ValidationError`, `phoneSchema`, `emailSchema`). Add to `customers.service.ts`:

```typescript
import { hashPassword, TEMP_PASSWORD, ValidationError, phoneSchema, emailSchema } from "@tiffin/commons"; // match the exact import paths used in orders.service.ts
import { account } from "@/db/schema"; // add to existing schema import

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Find-or-provision a customer (role "user") by phone. Returns internal users.id.
// Lifted verbatim from createOrder so both paths share one provisioning rule.
export async function provisionCustomerByPhone(
  tx: Tx,
  contact: { fullName: string; phone: string; email: string | null },
  createdBy: bigint | null,
): Promise<bigint> {
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, contact.phone)).limit(1);
  if (existing) return existing.id;

  if (contact.email) {
    const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.email, contact.email)).limit(1);
    if (clash) throw new ValidationError("That email is already in use");
  }
  const inserted = await tx
    .insert(users)
    .values({ phone: contact.phone, email: contact.email, name: contact.fullName, role: "user", createdBy })
    .onConflictDoNothing({ target: users.phone, where: sql`${users.phone} is not null` })
    .returning({ id: users.id });
  if (inserted[0]?.id) {
    await tx.insert(account).values({
      accountId: String(inserted[0].id),
      providerId: "credential",
      userId: inserted[0].id,
      password: await hashPassword(TEMP_PASSWORD),
    });
    return inserted[0].id;
  }
  const [raced] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, contact.phone)).limit(1);
  return raced.id;
}

// Resolve the acting user's public_id to the internal id used for createdBy.
async function resolveActorId(tx: Tx, actorId: string | null | undefined): Promise<bigint | null> {
  if (!actorId) return null;
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.publicId, actorId)).limit(1);
  return row?.id ?? null;
}

// Customer-only creation (no order). Idempotent by phone.
export async function createCustomer(
  contact: { fullName: string; phone: string; email?: string },
  opts: { actorId?: string | null },
): Promise<{ publicId: string }> {
  const parsedPhone = phoneSchema().safeParse(contact.phone);
  if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
  let email: string | null = null;
  if (contact.email?.trim()) {
    const parsedEmail = emailSchema.safeParse(contact.email);
    if (!parsedEmail.success) throw new ValidationError("Enter a valid email");
    email = parsedEmail.data;
  }
  return db.transaction(async (tx) => {
    const createdBy = await resolveActorId(tx, opts.actorId);
    const id = await provisionCustomerByPhone(
      tx,
      { fullName: contact.fullName, phone: parsedPhone.data, email },
      createdBy,
    );
    const [row] = await tx.select({ publicId: users.publicId }).from(users).where(eq(users.id, id)).limit(1);
    return { publicId: row.publicId };
  });
}
```

- [ ] **Step 4: Refactor `createOrder` to call the helper**

In `orders.service.ts`, replace the inline block (the `if (!userId) { ... }` email-clash + insert + account + race fallback, ~lines 101–122) with:

```typescript
if (!userId) {
  userId = await provisionCustomerByPhone(
    tx,
    { fullName: input.contact.fullName, phone, email },
    createdBy,
  );
}
```

Import `provisionCustomerByPhone` from `./customers.service`. Keep the preceding `ownerId`/find-by-phone precedence (lines 96–100) unchanged. Remove now-unused imports if any became dead (e.g. `account`, `hashPassword`, `TEMP_PASSWORD`) — verify with a grep before deleting.

- [ ] **Step 5: Run tests to verify they pass (incl. regression)**

Run: `cd apps/web && pnpm test:run lib/services/__tests__/customers-create.service.test.ts lib/services/__tests__/orders.service.test.ts lib/services/__tests__/inquiries-convert.test.ts`
Expected: PASS — new customer tests green AND existing order/convert tests still green (proves the extraction didn't change behavior).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/services/customers.service.ts apps/web/lib/services/orders.service.ts apps/web/lib/services/__tests__/customers-create.service.test.ts
git commit -m "refactor(customers): extract provisionCustomerByPhone; add createCustomer path"
```

---

### Task 3: `inquiriesService.resolveForSource` (the dedup rule)

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-resolve-for-source.service.test.ts`

**Interfaces:**
- Consumes: `findOpenByPhone` (Task 1), existing `create`, `read`.
- Produces: `resolveForSource(input): Promise<string>` returning an inquiry `publicId`. Input:
  ```typescript
  {
    phone: string;
    sourceKey: string;
    contact: { fullName: string; email?: string };
    interest?: { planInterest?: string; mealSizeInterest?: string; personsInterest?: number; postalCode?: string; preferredStart?: string; quotedPrice?: number; subSourceKey?: string; notes?: string };
    pickedId?: string;
  }
  ```
  Rule: (1) `pickedId` → use it, throw `ValidationError` if its stage is `converted`. (2) else open inquiry with same phone + same `sourceKey` → reuse its publicId. (3) else `create` a new inquiry and return its publicId.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/lib/services/__tests__/inquiries-resolve-for-source.service.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { ValidationError } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}
const base = { fullName: "Resolver", email: undefined as string | undefined };

describe("inquiriesService.resolveForSource", () => {
  beforeEach(reset);
  afterAll(reset);

  it("reuses an open inquiry with the same phone + source", async () => {
    const phone = "+16475554000";
    const existing = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base });
    expect(id).toBe(existing.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(1); // no duplicate
  });

  it("creates a new inquiry when the source differs", async () => {
    const phone = "+16475554001";
    const fb = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base });
    expect(id).not.toBe(fb.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(2);
  });

  it("creates a new inquiry when none exists for the phone", async () => {
    const id = await inquiriesService.resolveForSource({ phone: "+16475554002", sourceKey: "manual", contact: base });
    expect(id).toMatch(/^inq_/);
  });

  it("honors pickedId", async () => {
    const phone = "+16475554003";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base, pickedId: picked.publicId });
    expect(id).toBe(picked.publicId);
  });

  it("rejects reusing a converted inquiry via pickedId", async () => {
    const phone = "+16475554004";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    await inquiriesService.changeStage(picked.publicId, "converted");
    await expect(
      inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base, pickedId: picked.publicId }),
    ).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test:run lib/services/__tests__/inquiries-resolve-for-source.service.test.ts`
Expected: FAIL — `resolveForSource is not a function`.

- [ ] **Step 3: Implement `resolveForSource`**

```typescript
async resolveForSource(input: {
  phone: string;
  sourceKey: string;
  contact: { fullName: string; email?: string };
  interest?: {
    planInterest?: string; mealSizeInterest?: string; personsInterest?: number;
    postalCode?: string; preferredStart?: string; quotedPrice?: number;
    subSourceKey?: string; notes?: string;
  };
  pickedId?: string;
}): Promise<string> {
  if (input.pickedId) {
    const picked = await this.read(input.pickedId);
    if (picked.stage === "converted") throw new ValidationError("That inquiry is already converted");
    return picked.publicId;
  }
  const open = await this.findOpenByPhone(input.phone);
  const sameSource = open.find((o) => o.sourceKey === input.sourceKey);
  if (sameSource) return sameSource.publicId;

  const inq = await this.create({
    fullName: input.contact.fullName,
    phone: input.phone,
    ...(input.contact.email ? { email: input.contact.email } : {}),
    sourceKey: input.sourceKey,
    ...(input.interest ?? {}),
  });
  return inq.publicId;
}
```

Confirm `this.read(publicId)` returns an object with `.stage` and `.publicId` (it's used by `convert`/`markLost` already — it does).

- [ ] **Step 4: Run test to verify it passes**

Run the same command. Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-resolve-for-source.service.test.ts
git commit -m "feat(inquiries): resolveForSource — same-source reuse, else new lead"
```

---

### Task 4: Orchestration server actions

Thin glue — covered by the underlying service tests; verified manually in the UI.

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/orders/actions.ts`
- Create: `apps/web/app/(dashboard)/dashboard/customers/actions.ts`
- Create: `apps/web/app/(dashboard)/dashboard/_leads/match-actions.ts` (shared lookup action for `<InquiryMatch>`)

**Interfaces:**
- Produces:
  - `findInquiryMatches(phone: string): Promise<OpenInquiryMatch[]>` — `requireStaff` + `inquiriesService.findOpenByPhone`.
  - `createOrderFlow(input: { source: { sourceKey: string; subSourceKey?: string }; contact: { fullName: string; phone: string; email?: string }; interest?: {...}; pickedInquiryId?: string; order: CreateOrderInput }): Promise<void>` — resolves inquiry, then `inquiriesService.convert(inquiryId, order)` (which redirects to `/activate`).
  - `createCustomerFlow(input: { source: { sourceKey: string; subSourceKey?: string }; contact: { fullName: string; phone: string; email?: string }; interest?: {...}; pickedInquiryId?: string }): Promise<{ customerPublicId: string; inquiryId: string }>` — resolves inquiry, then `createCustomer`. Returns ids so the UI can offer step-2 order.
- Consumes: Tasks 1–3, existing `inquiriesService.convert`, `requireStaff`, `revalidatePath`.

- [ ] **Step 1: Write `match-actions.ts`**

```typescript
"use server";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";

export async function findInquiryMatches(phone: string) {
  await requireStaff();
  if (!phone || phone.trim().length < 6) return [];
  return inquiriesService.findOpenByPhone(phone);
}
```

- [ ] **Step 2: Write `orders/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import type { CreateOrderInput } from "@/lib/services/orders.service";

type Source = { sourceKey: string; subSourceKey?: string };
type Contact = { fullName: string; phone: string; email?: string };
type Interest = {
  planInterest?: string; mealSizeInterest?: string; personsInterest?: number;
  postalCode?: string; preferredStart?: string; quotedPrice?: number;
};

export async function createOrderFlow(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
  order: CreateOrderInput;
}): Promise<void> {
  await requireStaff();
  const inquiryId = await inquiriesService.resolveForSource({
    phone: input.contact.phone,
    sourceKey: input.source.sourceKey,
    contact: { fullName: input.contact.fullName, email: input.contact.email },
    interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
    pickedId: input.pickedInquiryId,
  });
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/inquiries");
  await inquiriesService.convert(inquiryId, input.order); // redirects to /activate
}
```

- [ ] **Step 3: Write `customers/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth"; // match how other actions read the acting user; if guards return the user, use that instead
import { inquiriesService } from "@/lib/services/inquiries.service";
import { createCustomer } from "@/lib/services/customers.service";

type Source = { sourceKey: string; subSourceKey?: string };
type Contact = { fullName: string; phone: string; email?: string };
type Interest = {
  planInterest?: string; mealSizeInterest?: string; personsInterest?: number;
  postalCode?: string; preferredStart?: string; quotedPrice?: number;
};

export async function createCustomerFlow(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
}): Promise<{ customerPublicId: string; inquiryId: string }> {
  await requireStaff();
  const inquiryId = await inquiriesService.resolveForSource({
    phone: input.contact.phone,
    sourceKey: input.source.sourceKey,
    contact: { fullName: input.contact.fullName, email: input.contact.email },
    interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
    pickedId: input.pickedInquiryId,
  });
  const actorId = (await getSession())?.user?.id ?? null;
  const { publicId } = await createCustomer(input.contact, { actorId });
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/inquiries");
  return { customerPublicId: publicId, inquiryId };
}
```

Before writing, open one existing action file (e.g. `inquiries/[id]/order/actions.ts`) to copy the exact session-reading import (`getSession` vs `requireStaff` return). Use whatever that file uses — do not invent an import path.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck` (or the repo's `tsc -p` script).
Expected: no errors in the three new files.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/orders/actions.ts" "apps/web/app/(dashboard)/dashboard/customers/actions.ts" "apps/web/app/(dashboard)/dashboard/_leads/match-actions.ts"
git commit -m "feat(leads): order/customer creation flows + inquiry-match action"
```

---

### Task 5: `<InquiryMatch>` reusable client component

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/_leads/inquiry-match.tsx`

**Interfaces:**
- Consumes: `findInquiryMatches` (Task 4), the `OpenInquiryMatch` shape (Task 1).
- Produces: `<InquiryMatch phone sourceKey pickedId onPick />` —
  ```typescript
  function InquiryMatch(props: {
    phone: string;            // current valid E.164 phone, or "" 
    sourceKey: string;        // currently selected source
    pickedId: string | null;  // controlled selection
    onPick: (id: string | null, lockedSourceKey?: string) => void;
  }): JSX.Element | null
  ```
  Behavior: debounce `phone` ~400ms; when length ≥ 6, call `findInquiryMatches`. Render nothing if no matches. Otherwise list each match (source label · stage · relative age) with a "Use this" button calling `onPick(match.publicId, match.sourceKey)`. If a match's `sourceKey === sourceKey` and `pickedId` is null, auto-call `onPick(match.publicId, match.sourceKey)` once (effect guarded by a ref) to realize "always reuse on same source". Show a "Create new inquiry instead" link that calls `onPick(null)`.

- [ ] **Step 1: Read framework + UI conventions**

Read `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` for the source-pills + `SectionLabel` pattern and the `cn`/badge styling already in use. Apply make-interfaces-feel-better / impeccable polish (subtle, tabular age, no text effects per project rule). Check `node_modules/next/dist/docs/` if using any Next client API you're unsure about.

- [ ] **Step 2: Write the component**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { findInquiryMatches } from "./match-actions";

type Match = { publicId: string; sourceKey: string; sourceLabel: string; stage: string; createdAt: number };

function ageLabel(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function InquiryMatch({
  phone, sourceKey, pickedId, onPick,
}: {
  phone: string;
  sourceKey: string;
  pickedId: string | null;
  onPick: (id: string | null, lockedSourceKey?: string) => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const autoPicked = useRef<string | null>(null);

  useEffect(() => {
    const p = phone.trim();
    if (p.length < 6) { setMatches([]); return; }
    const t = setTimeout(async () => {
      try { setMatches(await findInquiryMatches(p)); } catch { setMatches([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  // Always-reuse: a same-source open match auto-selects once.
  useEffect(() => {
    const same = matches.find((m) => m.sourceKey === sourceKey);
    if (same && pickedId == null && autoPicked.current !== same.publicId) {
      autoPicked.current = same.publicId;
      onPick(same.publicId, same.sourceKey);
    }
  }, [matches, sourceKey, pickedId, onPick]);

  if (matches.length === 0) return null;

  return (
    <div className="border-border/70 grid gap-1.5 rounded-xl border p-3 text-sm">
      <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
        {matches.length} open inquir{matches.length === 1 ? "y" : "ies"} for this number
      </p>
      {matches.map((m) => {
        const active = pickedId === m.publicId;
        return (
          <button
            key={m.publicId}
            type="button"
            onClick={() => onPick(m.publicId, m.sourceKey)}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
              active ? "border-primary/30 bg-primary/10" : "border-border hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2">
              <MapPinIcon className="text-muted-foreground size-3.5" />
              <span className="font-medium">{m.sourceLabel}</span>
              <span className="text-muted-foreground">· {m.stage} · {ageLabel(m.createdAt)}</span>
            </span>
            <span className={cn("text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}>
              {active ? "Using" : "Use this"}
            </span>
          </button>
        );
      })}
      {pickedId && (
        <button type="button" onClick={() => onPick(null)} className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline underline-offset-2">
          Create new inquiry instead
        </button>
      )}
    </div>
  );
}
```

`Date.now()` in a client component is fine (this is browser code, not a workflow script).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`. Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/_leads/inquiry-match.tsx"
git commit -m "feat(leads): InquiryMatch widget — live dedup, same-source auto-reuse"
```

---

### Task 6: New Order sheet on the Orders list

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/orders/new-order-sheet.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/orders/page.tsx` (load catalog/sources/zones; render trigger)

**Interfaces:**
- Consumes: `createOrderFlow` (Task 4), `<InquiryMatch>` (Task 5), existing `OrderForm` + `orderFormSchema`, the source-pills pattern, the catalog/zones loaders the inquiry page and ConvertSheet already use.

- [ ] **Step 1: Read the data-loading + form patterns**

Read `apps/web/app/(dashboard)/dashboard/inquiries/page.tsx` (how `sources`, `zones` are loaded), `inquiries/[id]/page.tsx` (how `catalog` + `enabledSlots` are built for `ConvertSheet`), and `inquiries/[id]/order/order-form.tsx` (its props + how it calls `convertInquiry`). The New Order sheet mirrors `ConvertSheet` but adds the source pills + `<InquiryMatch>` ahead of the order fields, and submits via `createOrderFlow` instead of starting from a known inquiry.

- [ ] **Step 2: Build `new-order-sheet.tsx`**

A client `Sheet` (mirror `new-inquiry-form.tsx` structure and `ConvertSheet`):
1. Source pills (copy the `role="radiogroup"` pills block from `new-inquiry-form.tsx`) bound to local `sourceKey` state; `subSourceKey` select when the chosen source has subs.
2. Contact fields: full name, `PhoneInput`, email — local state (or a small RHF form).
3. `<InquiryMatch phone={phone} sourceKey={sourceKey} pickedId={pickedId} onPick={...} />`. `onPick(id, lockedSource)` sets `pickedId` and, when locking, sets `sourceKey` to `lockedSource`.
4. Reuse `OrderForm` for the order fields — but `OrderForm` currently calls `convertInquiry(inquiryId, ...)` internally. To reuse it for the standalone flow, lift its submit: pass an optional `onCreate?(order: CreateOrderInput): Promise<void>` prop to `OrderForm`; when provided, call it instead of `convertInquiry`. (Small, backward-compatible change to `order-form.tsx`.) The sheet passes `onCreate={(order) => createOrderFlow({ source, contact, interest, pickedInquiryId: pickedId ?? undefined, order })}`.

Show the same out-of-zone / waitlist hint `OrderForm` already renders. Apply impeccable/make-interfaces-feel-better polish; reuse `SectionLabel`.

- [ ] **Step 3: Add the `onCreate` prop to `OrderForm`**

In `order-form.tsx`, change the submit handler:

```tsx
// add to props
onCreate?: (order: CreateOrderInput) => Promise<void>;
// in onSubmit, replace the convertInquiry call:
if (onCreate) { await onCreate(orderInput); return; }
await convertInquiry(inquiryId, orderInput);
```

Keep `inquiryId` optional-friendly: when `onCreate` is supplied the sheet may pass `inquiryId=""`. Confirm nothing else in `OrderForm` requires a real `inquiryId` before submit.

- [ ] **Step 4: Wire the trigger into `orders/page.tsx`**

Load `sources`/`zones`/`catalog`/`enabledSlots` the same way `inquiries/page.tsx` and `inquiries/[id]/page.tsx` do (copy the `Promise.all` selects), and render `<NewOrderSheet ...>` with a "New order" `Button` trigger near the page header, matching how `AddInquirySheet` is placed.

- [ ] **Step 5: Verify in the running app**

Run: `cd apps/web && pnpm dev` (or the project's run skill). As staff, open `/dashboard/orders` → New order. Enter a phone that has an open inquiry → match list shows; same-source locks. Fill the order → submit → lands on `/activate/:id`. Confirm the inquiry is now `converted` and a customer exists. Then a brand-new phone+source → creates a fresh inquiry + order + customer.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/orders/new-order-sheet.tsx" "apps/web/app/(dashboard)/dashboard/orders/page.tsx" "apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx"
git commit -m "feat(orders): New order sheet — source + inquiry-match + order, lead-traced"
```

---

### Task 7: New Customer sheet (2-step) on the Customers list

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/customers/new-customer-sheet.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/customers/page.tsx` (load sources [+catalog/zones for step 2]; render trigger)

**Interfaces:**
- Consumes: `createCustomerFlow` + `createOrderFlow` (Task 4), `<InquiryMatch>` (Task 5), source pills, `OrderForm` with the `onCreate` prop (Task 6), `PhoneInput`.

- [ ] **Step 1: Build `new-customer-sheet.tsx`**

Client `Sheet`, two steps in local state (`step: 1 | 2`):

Step 1 — source pills + contact + `<InquiryMatch>` (same wiring as Task 6). Footer two buttons:
- **Save** → `await createCustomerFlow({ source, contact, interest, pickedInquiryId })`; toast success; close.
- **Save & add order →** → `const { inquiryId } = await createCustomerFlow(...)`; store `inquiryId` as the picked id; `setStep(2)`.

Step 2 — reuse `OrderForm` with `onCreate={(order) => createOrderFlow({ source, contact, interest, pickedInquiryId: inquiryId, order })}`. Pre-fill contact. Because step 1 already resolved/created the inquiry, passing its id as `pickedInquiryId` makes `resolveForSource` reuse it (no duplicate).

Guard against double customer creation: step 2 must NOT call `createCustomerFlow` again — only `createOrderFlow` (whose `convert`→`createOrder` re-provisions the same customer idempotently by phone).

- [ ] **Step 2: Wire the trigger into `customers/page.tsx`**

Load `sources` (and catalog/zones/enabledSlots for step 2, same selects as Task 6). Render `<NewCustomerSheet ...>` with a "New customer" `Button` near the header.

- [ ] **Step 3: Verify in the running app**

`/dashboard/customers` → New customer. (a) Save-only path → customer created, an inquiry exists at stage `new`, no order. (b) Save & add order → step 2 → submit → order created, same customer (no duplicate user for the phone), inquiry now `converted`. (c) Phone with same-source open inquiry → match auto-locks and is reused.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/customers/new-customer-sheet.tsx" "apps/web/app/(dashboard)/dashboard/customers/page.tsx"
git commit -m "feat(customers): New customer sheet — source + optional add-order step"
```

---

## Self-Review

**Spec coverage:**
- Inquiry resolution rule → Task 3. ✓
- `findOpenByPhone` → Task 1. ✓
- Shared customer provisioning + `createCustomer` → Task 2. ✓
- Orchestration flows → Task 4. ✓
- `<InquiryMatch>` (live + same-source auto-lock) → Task 5. ✓
- New Order entry → Task 6. ✓
- New Customer entry + optional step-2 → Task 7. ✓
- Inquiry-detail ConvertSheet unchanged → no task needed (explicitly out of scope). ✓
- Tests for resolveForSource / findOpenByPhone / createCustomer + convert regression → Tasks 1–3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows code. UI Tasks 6–7 reference exact files to mirror and give the precise prop/wiring changes rather than full 200-line sheet bodies — acceptable because they reuse already-shipped components (`OrderForm`, source pills, `AddInquirySheet` structure); the only new logic (the `onCreate` prop, step state, flow calls) is shown verbatim.

**Type consistency:** `OpenInquiryMatch` shape identical across Tasks 1/4/5. `resolveForSource` returns a publicId string consumed by `convert(publicId, order)` (existing signature). `createCustomer(contact, { actorId })` and `provisionCustomerByPhone(tx, contact, createdBy)` signatures match Task 4 callers. `createOrderFlow`/`createCustomerFlow` input shapes match the sheet calls in Tasks 6/7.

**Open verification flags (resolve during execution, not blockers):**
- Exact test script name in `apps/web/package.json` (`test:run` assumed) and the env-file invocation — confirm in Task 1 Step 2.
- Exact session-read import in server actions (`getSession` vs guard return) — confirm in Task 4 Step 3.
- `OrderForm` not depending on a real `inquiryId` pre-submit — confirm in Task 6 Step 3.
