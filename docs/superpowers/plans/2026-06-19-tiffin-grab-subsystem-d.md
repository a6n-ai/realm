# Subsystem D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship subsystem D — sales-agent Inquiries CRM, agent order creation, and admin catalog editor — plus the two slice-1 amendments it requires (`subscriptions`→`orders` rename and a dual-identity user model).

**Architecture:** Reuse the existing two-tier repository/service stack (`@tiffin/commons-drizzle`) and REST factories (`@tiffin/commons-next`). Order creation is extracted from the public checkout action into one shared `createOrder` service that both the public checkout and the agent form call (single authoritative pricing path). Inquiries carry an append-only `inquiry_activities` timeline. Catalog deletes are soft (an `active` flag) so historical orders stay valid. Identity becomes dual: phone and email are both optional + unique-when-present; staff are email-based, customers phone-based; login accepts either.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Drizzle ORM + Postgres, Auth.js v5 (Credentials, JWT sessions), Vitest, Tailwind v4 + shadcn, react-hook-form + zod.

## Global Constraints

- **Next.js 16:** route guard lives in `proxy.ts` (renamed middleware); read `node_modules/next/dist/docs/` before framework code. `params` is a `Promise` in route handlers/pages.
- **Pricing is server-side only.** The client never submits totals; `createOrder` always re-prices via `priceSubscription`.
- **Audit fields** (`createdBy`/`updatedBy`) are stamped from the session, never trusted from input. The service write path strips managed fields (`stripManaged`) and writable fields are allowlisted.
- **TypeScript everywhere; no unnecessary comments** (only the non-obvious *why*). `rg`/`fd` over `grep`/`find`.
- **Identity invariant:** every user has at least one of `phone`/`email`; staff (`admin`/`member`) require email, customers (`user`) require phone. Both unique when present.
- **Migrations:** `drizzle-kit generate` emits DROP+CREATE for renames. For any table/column/enum **rename**, hand-edit the generated `.sql` to use `ALTER ... RENAME` (the snapshot already reflects the end state, so later generates stay clean). Run from `apps/web`. DB is local Postgres at `DATABASE_URL` (default `postgres://lawbringr@localhost:5432/tiffin`).
- **Commit style:** plain messages, no Co-Authored-By trailer.
- **Verify command (whole repo):** from repo root `pnpm test && pnpm typecheck && pnpm build`.

---

## File structure

**Phase 0 — slice-1 amendments**
- Modify: `apps/web/db/schema/orders.ts` (rename to orders), `apps/web/db/schema/auth.ts` (dual identity), all refs to `subscriptions`/`subscriptionStatus`.
- Modify: `apps/web/lib/auth/index.ts` (authorize by phone OR email), `apps/web/app/(auth)/login/login-form.tsx` (identifier field).
- Create: `apps/web/lib/services/users-contact.ts` (validation helpers).
- Modify: `apps/web/lib/services/users.service.ts` (`updateContact`).

**Phase 1 — shared order service**
- Create: `apps/web/lib/services/orders.service.ts` (`createOrder`).
- Modify: `apps/web/app/(public)/checkout/actions.ts` (delegate to `createOrder`).

**Phase 2 — catalog soft-delete + editor backend**
- Modify: `apps/web/db/schema/catalog.ts` (`active` flags), `apps/web/lib/catalog/load.ts` (filter active).
- Create: `apps/web/lib/services/catalog.service.ts` (extend to all tables, soft-delete), API route files per resource.

**Phase 3 — inquiries backend**
- Create: `apps/web/db/schema/inquiries.ts`, `apps/web/lib/services/inquiries.service.ts`, `apps/web/app/api/inquiries/**`.
- Modify: `apps/web/db/schema/index.ts`.

**Phase 4 — guards + access**
- Modify: `apps/web/lib/auth/guards.ts` (`requireRole`/`requireStaff`), `apps/web/app/(dashboard)/layout.tsx`.

**Phase 5 — dashboard UI**
- Modify: `apps/web/components/dashboard/app-sidebar.tsx`.
- Create: inquiries pages, agent order form, catalog editor pages, account page.

**Phase 6 — seeds + final verify**
- Modify: `apps/web/db/seed-admin.ts`, `apps/web/db/seed.ts`.

---

## Phase 0 — Slice-1 amendments

### Task 1: Rename `subscriptions` → `orders`

**Files:**
- Modify: `apps/web/db/schema/orders.ts`
- Modify: `apps/web/app/(public)/checkout/actions.ts`
- Modify (refs): `apps/web/db/schema/index.ts` (export already `./orders` — keep)
- Create: `apps/web/db/migrations/0005_rename_orders.sql` (hand-edited)
- Test: existing `apps/web/lib/pricing/*` + checkout — re-run suite

**Interfaces:**
- Produces: `orders` table, `orderStatus` enum, `payments.orderId`. Consumed by Task 5 (`createOrder`) and Phase 5 UI.

- [ ] **Step 1: Edit the schema** — `apps/web/db/schema/orders.ts`: rename the table export and all identifiers.

```ts
export const orderStatus = pgEnum("order_status", ["pending", "active", "waitlisted", "cancelled"]);
export const paymentStatus = pgEnum("payment_status", ["simulated_paid"]);

export const orders = pgTable("orders", {
  ...updatableColumns,
  userId: uuid("user_id").references(() => users.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  mealSizeId: uuid("meal_size_id").notNull().references(() => mealSizes.id),
  frequencyId: uuid("frequency_id").notNull().references(() => deliveryFrequencies.id),
  dailyQty: integer("daily_qty").notNull().default(1),
  includeSaturday: boolean("include_saturday").notNull().default(false),
  includeSunday: boolean("include_sunday").notNull().default(false),
  isStudent: boolean("is_student").notNull().default(false),
  durationWeeks: integer("duration_weeks").notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").notNull(),
  weeklyFee: numeric("weekly_fee", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: orderStatus("status").notNull().default("pending"),
  deploymentId: text("deployment_id").notNull().unique(),
  zoneId: uuid("zone_id").references(() => deliveryZones.id),
  fullName: text("full_name").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
});

export const payments = pgTable("payments", {
  ...baseColumns,
  orderId: uuid("order_id").notNull().references(() => orders.id),
  status: paymentStatus("status").notNull().default("simulated_paid"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
});
```

- [ ] **Step 2: Fix references** — `rg -n "subscriptions|subscriptionStatus|subscriptionId" apps/web --type ts`. In `checkout/actions.ts` replace `subscriptions`→`orders`, `subscriptionId: sub.id`→`orderId: sub.id`, `subscriptions.id`→`orders.id`. (Task 5 rewrites this file anyway; just make it compile here.)

- [ ] **Step 3: Generate the migration**

Run: `cd apps/web && pnpm db:generate --name rename_orders`
Expected: a new `db/migrations/0005_*.sql` and updated `meta/`. drizzle-kit will likely emit DROP/CREATE.

- [ ] **Step 4: Hand-edit the generated SQL to use RENAME** — replace the drop/create body with:

```sql
ALTER TYPE "subscription_status" RENAME TO "order_status";
ALTER TABLE "subscriptions" RENAME TO "orders";
ALTER TABLE "payments" RENAME COLUMN "subscription_id" TO "order_id";
```

(Keep the generated filename and its `meta/_journal.json` entry. Verify the new snapshot under `meta/` reflects `orders`/`order_status`/`order_id` — it should, since the schema is the end state.)

- [ ] **Step 5: Apply + verify**

Run: `cd apps/web && pnpm db:migrate`
Then from repo root: `pnpm test && pnpm typecheck`
Expected: migrate OK; tests/typecheck PASS (rename is transparent to pricing tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/db apps/web/app/\(public\)/checkout/actions.ts
git commit -m "refactor(orders): rename subscriptions table to orders"
```

---

### Task 2: Dual-identity `users` schema

**Files:**
- Modify: `apps/web/db/schema/auth.ts`
- Create: `apps/web/db/migrations/0006_user_dual_identity.sql` (verify generated)

**Interfaces:**
- Produces: `users.email` nullable; partial unique indexes on `email` and `phone`. Consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Edit `auth.ts`** — drop `notNull()`/`.unique()` from email and phone columns, add partial unique indexes via the table extras callback.

```ts
import { integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["admin", "member", "user"]);

export const users = pgTable(
  "users",
  {
    ...updatableColumns,
    name: text("name"),
    email: text("email"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    passwordHash: text("password_hash"),
    phone: text("phone"),
    role: userRole("role").notNull().default("user"),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("users_phone_unique").on(t.phone).where(sql`${t.phone} is not null`),
  ],
);
```

- [ ] **Step 2: Generate + inspect**

Run: `cd apps/web && pnpm db:generate --name user_dual_identity`
Expected SQL contains: `DROP CONSTRAINT "users_email_unique"` (the old column unique), `ALTER COLUMN "email" DROP NOT NULL`, and two `CREATE UNIQUE INDEX ... WHERE ... IS NOT NULL`. If the old unique constraint name differs, confirm via `\d users` in psql and fix the DROP line.

- [ ] **Step 3: Apply + verify**

Run: `cd apps/web && pnpm db:migrate`
Then: `psql "$DATABASE_URL" -c "\d users"` — confirm both partial unique indexes exist and email is nullable.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db
git commit -m "feat(auth): dual-identity users — nullable email, partial unique phone/email"
```

---

### Task 3: Authorize by phone OR email + login form

**Files:**
- Modify: `apps/web/lib/auth/index.ts`
- Modify: `apps/web/app/(auth)/login/login-form.tsx`
- Test: `apps/web/lib/auth/__tests__/authorize.test.ts` (create)

**Interfaces:**
- Consumes: `users` (Task 2).
- Produces: credentials field `identifier` (was `email`). The login form posts `{ identifier, password }`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/auth/__tests__/authorize.test.ts`. Test the resolver directly by exporting it.

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { resolveCredentialUser } from "@/lib/auth/resolve-user";

async function reset() { await db.delete(users); }

describe("resolveCredentialUser", () => {
  beforeEach(async () => {
    await reset();
    const hash = await hashPassword("Secret123");
    await db.insert(users).values({ email: "staff@x.com", phone: null, passwordHash: hash, role: "member" });
    await db.insert(users).values({ email: null, phone: "+16475550100", passwordHash: hash, role: "user" });
  });
  afterAll(reset);

  it("resolves a staff user by email", async () => {
    const u = await resolveCredentialUser("staff@x.com", "Secret123");
    expect(u?.role).toBe("member");
  });
  it("resolves a customer by phone", async () => {
    const u = await resolveCredentialUser("+16475550100", "Secret123");
    expect(u?.role).toBe("user");
  });
  it("rejects a wrong password", async () => {
    expect(await resolveCredentialUser("staff@x.com", "nope")).toBeNull();
  });
  it("rejects an unknown identifier", async () => {
    expect(await resolveCredentialUser("ghost@x.com", "Secret123")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm test resolve` (or `vitest run lib/auth/__tests__/authorize.test.ts`)
Expected: FAIL — `resolve-user` not found.

- [ ] **Step 3: Implement the resolver** — `apps/web/lib/auth/resolve-user.ts`

```ts
import { Role, type RoleValue } from "@tiffin/commons";
import { eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "./password";

export interface CredentialUser { id: string; email: string | null; name: string | null; role: RoleValue; }

export async function resolveCredentialUser(identifier: string, password: string): Promise<CredentialUser | null> {
  const id = identifier.trim();
  if (!id || !password) return null;
  const lower = id.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, lower), eq(users.phone, id)))
    .limit(1);
  if (!user?.passwordHash) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role ?? Role.USER };
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd apps/web && pnpm test resolve`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the provider** — in `apps/web/lib/auth/index.ts`, replace the inline `authorize` body and credentials shape:

```ts
import { resolveCredentialUser } from "./resolve-user";
// ...
    Credentials({
      credentials: { identifier: {}, password: {} },
      authorize: async (raw) => {
        const user = await resolveCredentialUser(String(raw?.identifier ?? ""), String(raw?.password ?? ""));
        return user ?? null;
      },
    }),
```

Remove the now-unused `eq`/`users`/`verifyPassword` imports if they are no longer referenced (`rg -n "verifyPassword|users\b" apps/web/lib/auth/index.ts`).

- [ ] **Step 6: Update the login form** — `apps/web/app/(auth)/login/login-form.tsx`: rename field `email`→`identifier`, relax the zod schema, update the label.

```ts
const schema = z.object({
  identifier: z.string().min(1, "Phone or email is required"),
  password: z.string().min(1, "Password is required"),
});
// defaultValues: { identifier: "", password: "" }
// signIn("credentials", { ...values, redirect: false })
// FormField name="identifier", FormLabel "Phone or email",
//   <Input autoComplete="username" {...field} />   (drop type="email")
// error copy: "Invalid phone/email or password"
```

- [ ] **Step 7: Verify**

Run: `cd apps/web && pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/auth apps/web/app/\(auth\)/login
git commit -m "feat(auth): log in by phone or email"
```

---

### Task 4: `updateContact` self-service with validation

**Files:**
- Create: `apps/web/lib/services/users-contact.ts`
- Modify: `apps/web/lib/services/users.service.ts`
- Test: `apps/web/lib/services/__tests__/users-contact.test.ts`

**Interfaces:**
- Consumes: `users` (Task 2).
- Produces: `usersService.updateContact(userId, { phone?, email? }): Promise<User>`; helpers `normalizeEmail`, `isValidCaPhone` in `users-contact.ts`. Consumed by Phase 5 account page.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/services/__tests__/users-contact.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { usersService } from "../users.service";

let custId: string;
async function reset() { await db.delete(users); }

describe("usersService.updateContact", () => {
  beforeEach(async () => {
    await reset();
    const [c] = await db.insert(users).values({ phone: "+16475550100", role: "user" }).returning();
    await db.insert(users).values({ phone: "+16475550200", role: "user" });
    custId = c.id;
  });
  afterAll(reset);

  it("updates a customer's email when free", async () => {
    const u = await usersService.updateContact(custId, { email: "Me@X.com" });
    expect(u.email).toBe("me@x.com");
  });
  it("rejects a phone owned by another user", async () => {
    await expect(usersService.updateContact(custId, { phone: "+16475550200" }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects clearing the customer's required phone", async () => {
    await expect(usersService.updateContact(custId, { phone: "" }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects a malformed phone", async () => {
    await expect(usersService.updateContact(custId, { phone: "12" }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm test users-contact`
Expected: FAIL — `updateContact` not a function.

- [ ] **Step 3: Implement the helpers** — `apps/web/lib/services/users-contact.ts`

```ts
export function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }

// E.164-ish or 10-digit North American. Accepts "+16475550100" or "6475550100".
export function isValidCaPhone(phone: string): boolean {
  const digits = phone.replace(/[^\d+]/g, "");
  return /^\+?1?\d{10}$/.test(digits);
}

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}
```

- [ ] **Step 4: Implement `updateContact`** — extend `apps/web/lib/services/users.service.ts`

```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { ValidationError, Role } from "@tiffin/commons";
import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";
import { pickUserWritable } from "./users-writable";
import { isValidCaPhone, isValidEmail, normalizeEmail } from "./users-contact";

class UsersService extends SessionUpdatableService<typeof users> {
  async create(values: Record<string, unknown>) {
    return super.create(pickUserWritable(values));
  }
  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, pickUserWritable(patch));
  }

  async updateContact(userId: string, input: { phone?: string; email?: string }) {
    const [current] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!current) throw new ValidationError("User not found");

    const patch: { phone?: string | null; email?: string | null } = {};

    if (input.phone !== undefined) {
      const phone = input.phone.trim();
      if (phone === "") {
        if (current.role === Role.USER) throw new ValidationError("Phone is required for customers");
        patch.phone = null;
      } else {
        if (!isValidCaPhone(phone)) throw new ValidationError("Invalid phone number");
        await this.assertFree(userId, "phone", phone);
        patch.phone = phone;
      }
    }

    if (input.email !== undefined) {
      const raw = input.email.trim();
      if (raw === "") {
        if (current.role !== Role.USER) throw new ValidationError("Email is required for staff");
        patch.email = null;
      } else {
        if (!isValidEmail(raw)) throw new ValidationError("Invalid email address");
        const email = normalizeEmail(raw);
        await this.assertFree(userId, "email", email);
        patch.email = email;
      }
    }

    return super.update(userId, patch);
  }

  private async assertFree(userId: string, field: "phone" | "email", value: string) {
    const col = field === "phone" ? users.phone : users.email;
    const [clash] = await db.select({ id: users.id }).from(users)
      .where(and(eq(col, value), ne(users.id, userId))).limit(1);
    if (clash) throw new ValidationError(`That ${field} is already in use`);
  }
}

const repo = new UpdatableRepository(db, users, users.id);
export const usersService = new UsersService(repo);
```

Note: `updateContact` bypasses `pickUserWritable` deliberately (phone/email are in the allowlist anyway) and calls `super.update` with a narrow patch.

- [ ] **Step 5: Run it — verify it passes**

Run: `cd apps/web && pnpm test users-contact`
Expected: PASS (4 tests). Remove unused `or` import if TS flags it.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/services
git commit -m "feat(users): self-service updateContact with uniqueness + role validation"
```

---

## Phase 1 — Shared order service

### Task 5: Extract `createOrder`

**Files:**
- Create: `apps/web/lib/services/orders.service.ts`
- Modify: `apps/web/app/(public)/checkout/actions.ts`
- Test: `apps/web/lib/services/__tests__/orders.service.test.ts`

**Interfaces:**
- Consumes: `loadCatalogSnapshot`, `priceSubscription`, `buildPricingCatalog`, `matchZone`, `hashPassword`, `orders`/`payments`/`users`.
- Produces: `createOrder(input: CreateOrderInput, actorId?: string | null): Promise<{ deploymentId: string }>` and `CreateOrderInput { selections, planKey, contact: { fullName; phone; email?; addressLine; city; postalCode } }`. Consumed by checkout action (public) and Task 15 (agent form), and Task 10 (`convert`).

- [ ] **Step 1: Write the failing test** — `apps/web/lib/services/__tests__/orders.service.test.ts`. Requires seeded catalog (`pnpm db:seed:catalog`) — guard with a meal-size lookup.

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { createOrder } from "../orders.service";

async function reset() { await db.delete(payments); await db.delete(orders); await db.delete(users); }

describe("createOrder (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("provisions a customer by phone, prices server-side, writes order + payment", async () => {
    const snap = await loadCatalogSnapshot();
    const meal = snap.mealSizes[0];
    const plan = snap.plans[0];
    const { deploymentId } = await createOrder({
      planKey: plan.key,
      selections: {
        mealSizeId: meal.id, frequencyKey: "5_day", dailyQty: 1,
        includeSaturday: false, includeSunday: false, isStudent: false, durationWeeks: 1,
      },
      contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    expect(deploymentId).toMatch(/^SUB-/);
    const [u] = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(u.role).toBe("user");
    const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(Number(o.total)).toBeGreaterThan(0);
    const pays = await db.select().from(payments).where(eq(payments.orderId, o.id));
    expect(pays).toHaveLength(1);
  });

  it("reuses an existing customer on a second order with the same phone", async () => {
    const snap = await loadCatalogSnapshot();
    const meal = snap.mealSizes[0]; const plan = snap.plans[0];
    const input = {
      planKey: plan.key,
      selections: { mealSizeId: meal.id, frequencyKey: "5_day" as const, dailyQty: 1, includeSaturday: false, includeSunday: false, isStudent: false, durationWeeks: 1 },
      contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    };
    await createOrder(input); await createOrder(input);
    const rows = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm db:seed:catalog && pnpm test orders.service`
Expected: FAIL — `createOrder` not found.

- [ ] **Step 3: Implement `createOrder`** — `apps/web/lib/services/orders.service.ts` (lifted from `checkout/actions.ts`, keyed on phone, email optional).

```ts
import { generateCode, ValidationError } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { hashPassword } from "@/lib/auth/password";
import { normalizeEmail } from "./users-contact";

const TEMP_PASSWORD = "Tiffin123";

export interface CreateOrderInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; phone: string; email?: string; addressLine: string; city: string; postalCode: string };
}

export async function createOrder(input: CreateOrderInput, actorId?: string | null): Promise<{ deploymentId: string }> {
  const snapshot = await loadCatalogSnapshot();
  const pricing = priceSubscription(input.selections, buildPricingCatalog(snapshot, input.selections));

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!;
  const zone = matchZone(input.contact.postalCode, snapshot.zones);
  const zoneRow = zone ? snapshot.zones.find((z) => z.name === zone.name) : undefined;

  const phone = input.contact.phone.trim();
  if (!phone) throw new ValidationError("Phone is required");
  const email = input.contact.email?.trim() ? normalizeEmail(input.contact.email) : null;

  const deploymentId = generateCode("SUB", 6);

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    let userId = existing?.id ?? null;
    if (!userId) {
      if (email) {
        const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (clash) throw new ValidationError("That email is already in use");
      }
      const passwordHash = await hashPassword(TEMP_PASSWORD);
      const inserted = await tx.insert(users)
        .values({ phone, email, name: input.contact.fullName, passwordHash, role: "user", createdBy: actorId ?? null })
        .onConflictDoNothing({ target: users.phone })
        .returning({ id: users.id });
      userId = inserted[0]?.id
        ?? (await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1))[0].id;
    }

    const [order] = await tx.insert(orders).values({
      userId, planId: plan.id, mealSizeId: input.selections.mealSizeId, frequencyId: frequency.id,
      dailyQty: input.selections.dailyQty, includeSaturday: input.selections.includeSaturday,
      includeSunday: input.selections.includeSunday, isStudent: input.selections.isStudent,
      durationWeeks: input.selections.durationWeeks, pricingSnapshot: pricing,
      weeklyFee: pricing.weeklyFee.toFixed(2), total: pricing.total.toFixed(2),
      status: zoneRow ? "active" : "waitlisted", deploymentId, zoneId: zoneRow?.id ?? null,
      fullName: input.contact.fullName, addressLine: input.contact.addressLine,
      city: input.contact.city, postalCode: input.contact.postalCode, createdBy: actorId ?? null,
    }).returning({ id: orders.id });

    await tx.insert(payments).values({ orderId: order.id, status: "simulated_paid", amount: pricing.total.toFixed(2), createdBy: actorId ?? null });
  });

  return { deploymentId };
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd apps/web && pnpm test orders.service`
Expected: PASS (2 tests).

- [ ] **Step 5: Delegate the public checkout action** — rewrite `apps/web/app/(public)/checkout/actions.ts` to call `createOrder` (contact now carries `phone`; if the existing checkout form lacks a phone field, add a required phone input + zod field in `components/checkout/checkout.tsx` and pass it through).

```ts
"use server";

import { auth } from "@/lib/auth";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";

export type ConfirmInput = CreateOrderInput;

export async function confirmSubscription(input: ConfirmInput): Promise<{ deploymentId: string }> {
  const session = await auth();
  return createOrder(input, session?.user?.id ?? null);
}
```

- [ ] **Step 6: Verify the whole repo**

Run (root): `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS. (If checkout UI needed a phone field, confirm the build picks it up.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/services/orders.service.ts apps/web/app/\(public\)/checkout apps/web/components/checkout
git commit -m "refactor(orders): extract shared createOrder; checkout keys customers by phone"
```

---

## Phase 2 — Catalog soft-delete + editor backend

### Task 6: `active` flags + loader filter

**Files:**
- Modify: `apps/web/db/schema/catalog.ts`
- Modify: `apps/web/lib/catalog/load.ts`
- Modify: `apps/web/lib/catalog/types.ts`
- Test: `apps/web/lib/catalog/__tests__/load-active.test.ts`
- Create: `apps/web/db/migrations/0007_catalog_active.sql` (verify generated)

**Interfaces:**
- Produces: `active` boolean on plans/meal_sizes/addons/delivery_frequencies/duration_packages; `loadCatalogSnapshot` returns only active rows. Consumed by wizard + Task 7.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/catalog/__tests__/load-active.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes } from "@/db/schema";
import { loadCatalogSnapshot } from "../load";

describe("loadCatalogSnapshot active filter", () => {
  let restoreId: string | null = null;
  beforeEach(async () => {
    const rows = await db.select().from(mealSizes).limit(1);
    if (rows[0]) {
      restoreId = rows[0].id;
      await db.update(mealSizes).set({ active: false }).where(eq(mealSizes.id, rows[0].id));
    }
  });
  afterAll(async () => {
    if (restoreId) await db.update(mealSizes).set({ active: true }).where(eq(mealSizes.id, restoreId));
  });

  it("excludes inactive meal sizes", async () => {
    if (!restoreId) return;
    const snap = await loadCatalogSnapshot();
    expect(snap.mealSizes.find((m) => m.id === restoreId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm db:seed:catalog && pnpm test load-active`
Expected: FAIL — `active` column unknown / row still present.

- [ ] **Step 3: Add the columns** — in `apps/web/db/schema/catalog.ts`, add to plans, mealSizes, addons, deliveryFrequencies, durationPackages:

```ts
  active: boolean("active").notNull().default(true),
```

(`deliveryZones` already has `active`.) Generate + apply:

Run: `cd apps/web && pnpm db:generate --name catalog_active && pnpm db:migrate`
Expected SQL: five `ADD COLUMN "active" boolean DEFAULT true NOT NULL`.

- [ ] **Step 4: Filter the loader** — in `apps/web/lib/catalog/load.ts`, add `.where(eq(table.active, true))` to each active-bearing select and import `eq`:

```ts
import { eq } from "drizzle-orm";
// ...
    db.select().from(plans).where(eq(plans.active, true)),
    db.select().from(mealSizes).where(eq(mealSizes.active, true)),
    db.select().from(addons).where(eq(addons.active, true)),
    db.select().from(deliveryFrequencies).where(eq(deliveryFrequencies.active, true)),
    db.select().from(durationPackages).where(eq(durationPackages.active, true)),
    db.select().from(deliveryZones).where(eq(deliveryZones.active, true)),
```

- [ ] **Step 5: Run it — verify it passes**

Run: `cd apps/web && pnpm test load-active`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/db apps/web/lib/catalog
git commit -m "feat(catalog): active flag on catalog tables; wizard loads only active"
```

---

### Task 7: Catalog services (soft-delete) + REST

**Files:**
- Modify: `apps/web/lib/services/catalog.service.ts`
- Create: `apps/web/app/api/plans/{route.ts,[id]/route.ts,query/route.ts}` and the same trio for `addons`, `delivery-frequencies`, `duration-packages`, `delivery-zones`; add `[id]` + soft-delete to existing `meal-sizes`.
- Test: `apps/web/lib/services/__tests__/catalog-soft-delete.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (existing).
- Produces: `planService`, `mealSizeService`, `addonService`, `deliveryFrequencyService`, `durationPackageService`, `deliveryZoneService` — each a `SoftDeleteService` whose `delete(id)` sets `active=false`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/services/__tests__/catalog-soft-delete.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { addons } from "@/db/schema";
import { addonService } from "../catalog.service";

let id: string;
async function reset() { await db.delete(addons); }
describe("catalog soft-delete", () => {
  beforeEach(async () => {
    await reset();
    const [a] = await db.insert(addons).values({ key: "sat-test", name: "Sat", pricePerWeek: "15.00" }).returning();
    id = a.id;
  });
  afterAll(reset);

  it("delete() flips active=false instead of removing the row", async () => {
    await addonService.delete(id);
    const [row] = await db.select().from(addons).where(eq(addons.id, id));
    expect(row).toBeDefined();
    expect(row.active).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm test catalog-soft-delete`
Expected: FAIL — `addonService` not exported.

- [ ] **Step 3: Implement the services** — rewrite `apps/web/lib/services/catalog.service.ts`

```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class SoftDeleteService<TTable extends PgTable> extends SessionUpdatableService<TTable> {
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }
}

const make = <T extends PgTable & { id: PgTable["_"]["columns"] }>(table: T) =>
  new SoftDeleteService(new UpdatableRepository(db, table, (table as unknown as { id: never }).id));

export const planService = new SoftDeleteService(new UpdatableRepository(db, plans, plans.id));
export const mealSizeService = new SoftDeleteService(new UpdatableRepository(db, mealSizes, mealSizes.id));
export const addonService = new SoftDeleteService(new UpdatableRepository(db, addons, addons.id));
export const deliveryFrequencyService = new SoftDeleteService(new UpdatableRepository(db, deliveryFrequencies, deliveryFrequencies.id));
export const durationPackageService = new SoftDeleteService(new UpdatableRepository(db, durationPackages, durationPackages.id));
export const deliveryZoneService = new SoftDeleteService(new UpdatableRepository(db, deliveryZones, deliveryZones.id));
```

(Drop the unused `make` helper — kept above only as illustration; delete it before committing.)

- [ ] **Step 4: Run it — verify it passes**

Run: `cd apps/web && pnpm test catalog-soft-delete`
Expected: PASS.

- [ ] **Step 5: Add REST routes** — for each resource create the trio. Example for `addons` (`apps/web/app/api/addons/route.ts`):

```ts
import { createCollectionRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { addonService } from "@/lib/services/catalog.service";
export const { GET, POST } = createCollectionRoute(addonService, { guard: () => requireAdmin() });
```

`apps/web/app/api/addons/[id]/route.ts`:

```ts
import { createResourceRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { addonService } from "@/lib/services/catalog.service";
export const { GET, PUT, PATCH, DELETE } = createResourceRoute(addonService, { guard: () => requireAdmin() });
```

`apps/web/app/api/addons/query/route.ts`:

```ts
import { createQueryRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { addonService } from "@/lib/services/catalog.service";
export const { POST } = createQueryRoute(addonService, { guard: () => requireAdmin() });
```

Repeat for `plans` (`planService`), `delivery-frequencies` (`deliveryFrequencyService`), `duration-packages` (`durationPackageService`), `delivery-zones` (`deliveryZoneService`). For existing `meal-sizes`, add the `[id]` route + `requireAdmin` guard to its `route.ts`/`query/route.ts`.

- [ ] **Step 6: Verify**

Run (root): `pnpm typecheck && pnpm build`
Expected: PASS — all new route files compile.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/services/catalog.service.ts apps/web/app/api
git commit -m "feat(catalog): soft-delete services + admin REST for all catalog resources"
```

---

## Phase 3 — Inquiries backend

### Task 8: Inquiries schema

**Files:**
- Create: `apps/web/db/schema/inquiries.ts`
- Modify: `apps/web/db/schema/index.ts`
- Create migration: `apps/web/db/migrations/0008_inquiries.sql` (verify generated)

**Interfaces:**
- Produces: tables `inquiries`, `inquiryActivities`; enums `inquiryStage`, `inquirySource`, `inquiryActivityType`. Consumed by Tasks 9, 10, Phase 5.

- [ ] **Step 1: Create the schema** — `apps/web/db/schema/inquiries.ts`

```ts
import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";

export const inquiryStage = pgEnum("inquiry_stage", ["new", "contacted", "follow_up", "converted", "lost"]);
export const inquirySource = pgEnum("inquiry_source", ["website", "facebook", "google", "manual", "referral"]);
export const inquiryActivityType = pgEnum("inquiry_activity_type", ["created", "note", "stage_change", "converted"]);

export const inquiries = pgTable("inquiries", {
  ...updatableColumns,
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  source: inquirySource("source").notNull().default("manual"),
  stage: inquiryStage("stage").notNull().default("new"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  convertedOrderId: uuid("converted_order_id").references(() => orders.id),
  prefs: jsonb("prefs"),
  notes: text("notes"),
});

export const inquiryActivities = pgTable("inquiry_activities", {
  ...baseColumns,
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  type: inquiryActivityType("type").notNull(),
  note: text("note"),
  fromStage: inquiryStage("from_stage"),
  toStage: inquiryStage("to_stage"),
});
```

- [ ] **Step 2: Export + migrate** — add `export * from "./inquiries";` to `apps/web/db/schema/index.ts`, then:

Run: `cd apps/web && pnpm db:generate --name inquiries && pnpm db:migrate`
Expected: creates three enums + two tables.

- [ ] **Step 3: Verify**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db
git commit -m "feat(inquiries): inquiries + inquiry_activities schema"
```

---

### Task 9: Inquiries service (CRUD + notes + stage)

**Files:**
- Create: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries.service.test.ts`

**Interfaces:**
- Consumes: `inquiries`, `inquiryActivities` (Task 8); session actor via `SessionUpdatableService`.
- Produces: `inquiriesService` with `create` (writes a `created` activity), `addNote(inquiryId, note)`, `changeStage(inquiryId, toStage)`, `listActivities(inquiryId)`. Consumed by Task 10 (`convert`) + Phase 5.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/services/__tests__/inquiries.service.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { inquiriesService } from "../inquiries.service";

async function reset() { await db.delete(inquiryActivities); await db.delete(inquiries); }

describe("inquiriesService", () => {
  beforeEach(reset);
  afterAll(reset);

  it("create writes a 'created' activity", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead A", phone: "+16475551000", source: "facebook" });
    const acts = await inquiriesService.listActivities(inq.id);
    expect(acts).toHaveLength(1);
    expect(acts[0].type).toBe("created");
  });

  it("changeStage updates stage and logs from/to", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead B", phone: "+16475551001" });
    await inquiriesService.changeStage(inq.id, "contacted");
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.stage).toBe("contacted");
    const acts = await inquiriesService.listActivities(inq.id);
    const change = acts.find((a) => a.type === "stage_change");
    expect(change?.fromStage).toBe("new");
    expect(change?.toStage).toBe("contacted");
  });

  it("addNote appends a note activity", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead C", phone: "+16475551002" });
    await inquiriesService.addNote(inq.id, "Called, no answer");
    const acts = await inquiriesService.listActivities(inq.id);
    expect(acts.some((a) => a.type === "note" && a.note === "Called, no answer")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm test inquiries.service`
Expected: FAIL — service not found.

- [ ] **Step 3: Implement the service** — `apps/web/lib/services/inquiries.service.ts`

```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { NotFoundError } from "@tiffin/commons";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

type Stage = (typeof inquiries.stage.enumValues)[number];

class InquiriesService extends SessionUpdatableService<typeof inquiries> {
  async create(values: Record<string, unknown>) {
    const inq = await super.create(values);
    await db.insert(inquiryActivities).values({
      inquiryId: inq.id, type: "created", toStage: inq.stage, createdBy: await this.currentUserId(),
    });
    return inq;
  }

  async addNote(inquiryId: string, note: string) {
    await this.read(inquiryId);
    await db.insert(inquiryActivities).values({
      inquiryId, type: "note", note, createdBy: await this.currentUserId(),
    });
  }

  async changeStage(inquiryId: string, toStage: Stage) {
    const current = await this.read(inquiryId);
    if (current.stage === toStage) return current;
    const updated = await this.update(inquiryId, { stage: toStage });
    await db.insert(inquiryActivities).values({
      inquiryId, type: "stage_change", fromStage: current.stage, toStage, createdBy: await this.currentUserId(),
    });
    return updated;
  }

  async listActivities(inquiryId: string) {
    return db.select().from(inquiryActivities)
      .where(eq(inquiryActivities.inquiryId, inquiryId))
      .orderBy(desc(inquiryActivities.createdAt));
  }
}

const repo = new UpdatableRepository(db, inquiries, inquiries.id);
export const inquiriesService = new InquiriesService(repo);
export type { Stage as InquiryStage };
```

Note: `read` throws `NotFoundError` (inherited) — `addNote`/`changeStage` validate existence. The `NotFoundError` import keeps the type referenced; drop it if TS flags it unused.

- [ ] **Step 4: Run it — verify it passes**

Run: `cd apps/web && pnpm test inquiries.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Add REST** — `apps/web/app/api/inquiries/route.ts`, `[id]/route.ts`, `query/route.ts`, guarded by a staff guard (Task 11 adds `requireStaff`; until then use `requireAdmin`, then switch in Task 11).

```ts
// route.ts
import { createCollectionRoute } from "@tiffin/commons-next";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
export const { GET, POST } = createCollectionRoute(inquiriesService, { guard: () => requireStaff() });
```

(Resource + query routes mirror Task 7's pattern.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/app/api/inquiries
git commit -m "feat(inquiries): service with activity timeline + staff REST"
```

---

### Task 10: `convert` an inquiry to an order

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-convert.test.ts`

**Interfaces:**
- Consumes: `createOrder` (Task 5).
- Produces: `inquiriesService.convert(inquiryId, orderInput: CreateOrderInput): Promise<{ deploymentId: string }>` — creates the order, links `convertedOrderId`, sets stage `converted`, writes a `converted` activity.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/services/__tests__/inquiries-convert.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { inquiriesService } from "../inquiries.service";

async function reset() {
  await db.delete(inquiryActivities); await db.delete(inquiries);
  await db.delete(payments); await db.delete(orders); await db.delete(users);
}

describe("inquiriesService.convert", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates an order, links it, and marks converted", async () => {
    const snap = await loadCatalogSnapshot();
    const meal = snap.mealSizes[0]; const plan = snap.plans[0];
    const inq = await inquiriesService.create({ fullName: "Lead D", phone: "+16475551200", source: "google" });
    const { deploymentId } = await inquiriesService.convert(inq.id, {
      planKey: plan.key,
      selections: { mealSizeId: meal.id, frequencyKey: "5_day", dailyQty: 1, includeSaturday: false, includeSunday: false, isStudent: false, durationWeeks: 1 },
      contact: { fullName: "Lead D", phone: "+16475551200", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.stage).toBe("converted");
    expect(row.convertedOrderId).not.toBeNull();
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(row.convertedOrderId).toBe(order.id);
    const acts = await inquiriesService.listActivities(inq.id);
    expect(acts.some((a) => a.type === "converted")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm test inquiries-convert`
Expected: FAIL — `convert` not a function.

- [ ] **Step 3: Implement `convert`** — add to `InquiriesService` (import `createOrder`, `orders`, `eq` already present):

```ts
import { createOrder, type CreateOrderInput } from "./orders.service";
import { orders } from "@/db/schema";
// ...
  async convert(inquiryId: string, orderInput: CreateOrderInput) {
    const inq = await this.read(inquiryId);
    const actor = await this.currentUserId();
    const result = await createOrder(orderInput, actor);
    const [order] = await db.select({ id: orders.id }).from(orders)
      .where(eq(orders.deploymentId, result.deploymentId)).limit(1);
    await this.update(inquiryId, { stage: "converted", convertedOrderId: order.id });
    await db.insert(inquiryActivities).values({
      inquiryId, type: "converted", fromStage: inq.stage, toStage: "converted", createdBy: actor,
    });
    return result;
  }
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd apps/web && pnpm test inquiries-convert`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries-convert.test.ts
git commit -m "feat(inquiries): convert to order with linkage + activity"
```

---

## Phase 4 — Guards + access

### Task 11: Role guards + dashboard gating

**Files:**
- Modify: `apps/web/lib/auth/guards.ts`
- Modify: `apps/web/app/(dashboard)/layout.tsx`
- Modify: inquiries API routes (swap `requireAdmin`→`requireStaff` if Task 9 used the placeholder)
- Test: `apps/web/lib/auth/__tests__/guards.test.ts`

**Interfaces:**
- Produces: `requireStaff()` (admin or member), `requireRole(...roles)`. Consumed by inquiries routes (staff) and catalog routes (admin, unchanged).

- [ ] **Step 1: Write the failing test** — `apps/web/lib/auth/__tests__/guards.test.ts` (unit: mock `auth`).

```ts
import { describe, expect, it, vi } from "vitest";
import { AuthError, ForbiddenError } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
const { auth } = await import("@/lib/auth");
const { requireStaff, requireRole } = await import("../guards");

describe("requireStaff", () => {
  it("throws AuthError when signed out", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(requireStaff()).rejects.toBeInstanceOf(AuthError);
  });
  it("allows a member", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireStaff()).resolves.toBeUndefined();
  });
  it("forbids a customer", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ user: { role: "user" } });
    await expect(requireStaff()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("requireRole enforces an explicit set", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireRole("admin")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && pnpm test guards`
Expected: FAIL — `requireStaff`/`requireRole` not exported.

- [ ] **Step 3: Implement** — extend `apps/web/lib/auth/guards.ts`

```ts
import { AuthError, ForbiddenError, Role, type RoleValue } from "@tiffin/commons";
import { auth } from "@/lib/auth";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new AuthError();
  return session.user as { role: RoleValue };
}

export async function requireRole(...roles: RoleValue[]): Promise<void> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new ForbiddenError();
}

export async function requireAdmin(): Promise<void> {
  await requireRole(Role.ADMIN);
}

export async function requireStaff(): Promise<void> {
  await requireRole(Role.ADMIN, Role.MEMBER);
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd apps/web && pnpm test guards`
Expected: PASS (4 tests).

- [ ] **Step 5: Gate the dashboard layout** — in `apps/web/app/(dashboard)/layout.tsx`, fetch the session, redirect non-authenticated to `/login`, and pass `role` to the sidebar (already passes `user`). Confirm the layout already does an authoritative `await auth()` (per `proxy.ts` comment) — if not, add it.

- [ ] **Step 6: Verify**

Run (root): `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/auth/guards.ts apps/web/app/\(dashboard\)/layout.tsx apps/web/app/api/inquiries
git commit -m "feat(auth): requireStaff/requireRole guards; gate dashboard + inquiries"
```

---

## Phase 5 — Dashboard UI

> UI tasks: each adds a page/route + wires the corresponding server action/service. Test by `pnpm build` (catches RSC/type errors) and a manual smoke per task. Use existing shadcn components in `apps/web/components/ui`. Follow the pattern in `apps/web/app/(dashboard)/dashboard/users/` for server-component data loading + a client form calling a server action.

### Task 12: Sidebar nav + role gating

**Files:**
- Modify: `apps/web/components/dashboard/app-sidebar.tsx`

- [ ] **Step 1: Update `NAV`** — remove `soon` from Inquiries, point Weekly Menus stub aside, add Catalog + Account, and filter by role. Make `NAV` role-aware:

```tsx
type NavItem = { title: string; href: string; icon: LucideIcon; roles: string[] };

const NAV: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboardIcon, roles: ["admin", "member", "user"] },
  { title: "Inquiries", href: "/dashboard/inquiries", icon: ClipboardListIcon, roles: ["admin", "member"] },
  { title: "Catalog", href: "/dashboard/catalog", icon: UtensilsCrossedIcon, roles: ["admin"] },
  { title: "Users", href: "/dashboard/users", icon: UsersIcon, roles: ["admin"] },
  { title: "Account", href: "/dashboard/account", icon: UserIcon, roles: ["admin", "member", "user"] },
];
// render: NAV.filter((i) => i.roles.includes(user.role)).map(...)
```

Import `UserIcon` from lucide-react; drop the `soon` rendering branch.

- [ ] **Step 2: Verify + commit**

Run (root): `pnpm build`
```bash
git add apps/web/components/dashboard/app-sidebar.tsx
git commit -m "feat(dashboard): role-aware sidebar nav (inquiries, catalog, account)"
```

### Task 13: Inquiries list + create

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/page.tsx` (server: list grouped by stage)
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts` (`createInquiry`, `setStage`)
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` (client)

- [ ] **Step 1: Server actions** — `actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService, type InquiryStage } from "@/lib/services/inquiries.service";

export async function createInquiry(input: { fullName: string; phone: string; email?: string; source?: string; notes?: string }) {
  await requireStaff();
  const inq = await inquiriesService.create(input);
  revalidatePath("/dashboard/inquiries");
  return { id: inq.id };
}

export async function setStage(inquiryId: string, toStage: InquiryStage) {
  await requireStaff();
  await inquiriesService.changeStage(inquiryId, toStage);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}
```

- [ ] **Step 2: List page** — `page.tsx` (server component): `await requireStaff()`, load `inquiriesService.list(undefined, { page: 0, size: 200 })`, group by `stage`, render a column per stage with name/phone/source + a link to the detail page; mount `<NewInquiryForm />` in a dialog/section. Required fields in the form: `fullName`, `phone`; optional `email`, `source` (select of the five sources), `notes`. Use react-hook-form + zod like the login form.

- [ ] **Step 3: Verify + commit**

Run (root): `pnpm build`
```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries
git commit -m "feat(inquiries): pipeline list + create form"
```

### Task 14: Inquiry detail + timeline + stage control

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/note-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/actions.ts` (add `addNote`)

- [ ] **Step 1: Add `addNote` action**

```ts
export async function addNote(inquiryId: string, note: string) {
  await requireStaff();
  await inquiriesService.addNote(inquiryId, note);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}
```

- [ ] **Step 2: Detail page** — `[id]/page.tsx`: `await requireStaff()`; `const { id } = await params;` load `inquiriesService.read(id)` + `listActivities(id)`. Render contact block, a stage selector (calls `setStage`), the activity timeline (type + note + from/to + createdAt, newest first), a `<NoteForm />`, and a "Create order" button linking to `[id]/order`. Hide the create-order button when `stage === "converted"`.

- [ ] **Step 3: Verify + commit**

Run (root): `pnpm build`
```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries
git commit -m "feat(inquiries): detail page with timeline, notes, stage control"
```

### Task 15: Agent order form (convert)

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` (client)
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/actions.ts`

**Interfaces:**
- Consumes: `loadCatalogSnapshot`, `priceSubscription`/`buildPricingCatalog` (for live preview), `inquiriesService.convert`.

- [ ] **Step 1: Actions** — `actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { priceSubscription } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";

export async function previewPrice(input: CreateOrderInput) {
  await requireStaff();
  const snap = await loadCatalogSnapshot();
  return priceSubscription(input.selections, buildPricingCatalog(snap, input.selections));
}

export async function convertInquiry(inquiryId: string, input: CreateOrderInput) {
  await requireStaff();
  const { deploymentId } = await inquiriesService.convert(inquiryId, input);
  redirect(`/activate/${deploymentId}`);
}
```

- [ ] **Step 2: Form page** — `order/page.tsx` (server): `await requireStaff()`, load the inquiry + active catalog snapshot, render `<OrderForm inquiry={...} catalog={...} />`. The client form presents all selections on one page (plan, meal size, frequency, dailyQty 1–5, weekend add-ons, student, duration, address), prefilled from `inquiry.prefs`/contact (`fullName`, `phone`, `email`). It calls `previewPrice` on change for a live invoice and `convertInquiry` on submit. Reuse `components/wizard/invoice.tsx` for the breakdown if convenient.

- [ ] **Step 3: Verify + commit**

Run (root): `pnpm build`
```bash
git add apps/web/app/\(dashboard\)/dashboard/inquiries
git commit -m "feat(inquiries): agent order form converts an inquiry into an order"
```

### Task 16: Catalog editor

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/catalog/page.tsx` (admin index linking the six resources)
- Create: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx` (table + edit)
- Create: `apps/web/app/(dashboard)/dashboard/catalog/actions.ts`

- [ ] **Step 1: Actions** — `actions.ts` maps a resource key to its service and exposes `saveItem`/`retireItem`/`reactivateItem`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { addonService, deliveryFrequencyService, deliveryZoneService, durationPackageService, mealSizeService, planService } from "@/lib/services/catalog.service";

const SERVICES = {
  plans: planService, "meal-sizes": mealSizeService, addons: addonService,
  "delivery-frequencies": deliveryFrequencyService, "duration-packages": durationPackageService,
  "delivery-zones": deliveryZoneService,
} as const;
type ResourceKey = keyof typeof SERVICES;

export async function saveItem(resource: ResourceKey, id: string | null, patch: Record<string, unknown>) {
  await requireAdmin();
  const svc = SERVICES[resource];
  if (id) await svc.update(id, patch); else await svc.create(patch);
  revalidatePath(`/dashboard/catalog/${resource}`);
}
export async function retireItem(resource: ResourceKey, id: string) {
  await requireAdmin();
  await SERVICES[resource].delete(id);
  revalidatePath(`/dashboard/catalog/${resource}`);
}
export async function reactivateItem(resource: ResourceKey, id: string) {
  await requireAdmin();
  await SERVICES[resource].update(id, { active: true });
  revalidatePath(`/dashboard/catalog/${resource}`);
}
```

- [ ] **Step 2: Resource page** — `[resource]/page.tsx`: `await requireAdmin()`; `const { resource } = await params;` load all rows for that resource (active + inactive — query the table directly via `db`), render an editable table with retire/reactivate buttons and an add/edit dialog whose fields match the resource columns. Keep one generic page with a per-resource column config object.

- [ ] **Step 3: Verify + commit**

Run (root): `pnpm build`
```bash
git add apps/web/app/\(dashboard\)/dashboard/catalog
git commit -m "feat(catalog): admin editor with soft-delete + reactivate"
```

### Task 17: Account self-edit

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/account/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/account/account-form.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/account/actions.ts`

- [ ] **Step 1: Action** — `actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { AuthError } from "@tiffin/commons";
import { auth } from "@/lib/auth";
import { usersService } from "@/lib/services/users.service";

export async function updateMyContact(input: { phone?: string; email?: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError();
  await usersService.updateContact(session.user.id, input);
  revalidatePath("/dashboard/account");
}
```

- [ ] **Step 2: Page + form** — `page.tsx` loads the current user (`usersService.read(session.user.id)`), renders `<AccountForm phone={...} email={...} />`. The client form edits phone/email and calls `updateMyContact`, surfacing `ValidationError` messages (collision / required-field) inline via the returned error.

- [ ] **Step 3: Verify + commit**

Run (root): `pnpm build`
```bash
git add apps/web/app/\(dashboard\)/dashboard/account
git commit -m "feat(account): customer self-edit of phone/email with validation"
```

---

## Phase 6 — Seeds + final verification

### Task 18: Update seeds + full re-verify

**Files:**
- Modify: `apps/web/db/seed-admin.ts` (admin keeps email; no phone needed)
- Modify: `apps/web/db/seed.ts` (add a member + a sample inquiry source flag if desired)

- [ ] **Step 1: Seed a member** — extend `seed-admin.ts` to also seed a `member` (email-based) so the inquiries area is usable:

```ts
const MEMBER_EMAIL = process.env.SEED_MEMBER_EMAIL ?? "sales@tiffingrab.ca";
const MEMBER_PASSWORD = process.env.SEED_MEMBER_PASSWORD ?? "Member123!";
// after admin upsert:
const [m] = await db.select().from(users).where(eq(users.email, MEMBER_EMAIL)).limit(1);
if (!m) {
  await db.insert(users).values({ email: MEMBER_EMAIL, name: "Sales Agent", passwordHash: await hashPassword(MEMBER_PASSWORD), role: "member" });
  console.log(`Seeded member: ${MEMBER_EMAIL} / ${MEMBER_PASSWORD}`);
}
```

- [ ] **Step 2: Run seeds**

Run: `cd apps/web && pnpm db:seed && pnpm db:seed:catalog && pnpm db:seed:admin`
Expected: idempotent, no errors.

- [ ] **Step 3: Full repo verify**

Run (root): `pnpm test && pnpm typecheck && pnpm build`
Expected: all green — slice 1 + D.

- [ ] **Step 4: Manual smoke** (document results):
  1. Public `/subscribe` → checkout (with phone) → `/activate/SUB-...` → order row created.
  2. Log in as member (`sales@tiffingrab.ca`) → `/dashboard/inquiries` → create inquiry → add note → change stage → create order → activation.
  3. Log in as admin → `/dashboard/catalog/meal-sizes` → retire an item → confirm it vanishes from `/subscribe`, reactivate.
  4. `/dashboard/account` → change phone to a taken number → see validation error; change to a free number → success; log out and log back in with the new phone.

- [ ] **Step 5: Commit**

```bash
git add apps/web/db/seed-admin.ts apps/web/db/seed.ts
git commit -m "chore(seed): seed a sales member for the inquiries CRM"
```

---

## Self-review notes

- **Spec coverage:** §3.1 rename→T1; §3.2 dual identity→T2; §3.3 inquiries→T8; §3.4 activities→T8/T9; §3.5 soft-delete→T6/T7; §4 auth→T3; §5.1 createOrder→T5; §5.2 inquiries service→T9/T10; §5.3 catalog services→T7; §5.4 updateContact→T4; §6.1 REST→T7/T9; §6.2 pages→T12–T17; §6.3 access→T11; §7 testing→TDD steps across T3–T11 + T18 smoke; §8 risks→migration hand-edit (T1), partial indexes (T2), reprice parity (T5 test), soft-delete (T6/T7), collision validation (T4/T5).
- **Migration ordering:** 0005 rename, 0006 identity, 0007 catalog active, 0008 inquiries — sequential; each applied + verified before the next.
- **Type consistency:** `createOrder(input, actorId?)` / `CreateOrderInput` used identically in T5, T10, T15; `requireStaff`/`requireRole` defined in T11 and referenced by T9 routes (placeholder `requireAdmin` swapped in T11 Step 7); `InquiryStage` exported from the service and consumed by the actions in T13.
