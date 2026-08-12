# Puchkaman Notifications Adoption — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plan A (`2026-08-12-realm-notifications-package.md`) must be complete — `@realm/notifications` exists and tiffin-grab runs on it.

**Goal:** Puchkaman gains customer user records, an event-driven notification pipeline that actually delivers, an SSE-backed staff bell, the admin template UI, and SES bounce/complaint feedback wired to the database.

**Architecture:** Puchkaman customers are guests today — `orders.customer_email` with no account. They become `users` rows with `role: "user"` and **no credential**, so notifications have a recipient and `orders.user_id` (an existing, never-populated column) gets an owner. Business events call `enqueue()` inside the transaction that already exists at each state change. A `drainer` compose service polls the outbox. Realtime uses `@realm/realtime`'s in-process bus over SSE — puchkaman is a single instance, so there is no second process to route to and no RabbitMQ.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres, `@realm/notifications`, `@realm/realtime` (SSE + memory bus), `@realm/crm` (CrmShell), Better Auth, AWS SES + SNS, CloudFormation, Docker Compose, Vitest.

## Global Constraints

- Packages ship raw `.ts`/`.tsx`. `@realm/notifications` must be added to `apps/puchkaman/next.config.ts` `transpilePackages`.
- Puchkaman is **staff-only for login**. Roles are `admin` and `member`; `users.role` defaults to `member`. The `user` role exists in the enum and is currently unassigned — this plan starts assigning it, to accounts that must never obtain a session.
- Pricing/totals are computed **server-side only**. Nothing in this plan may recompute or expose an amount from client input.
- Audit fields (`created_by`/`updated_by`) are stamped from the session, never from input. A customer user created by a public checkout has no session — leave them null rather than inventing an actor.
- Admin UI uses scoped CRM styling (`crm.css`, shared shell patterns). Neobrutalist/`brutal` components stay on the public site. Light CRM theme reuses the public yellow+green brand; red is destructive/status only.
- Entity naming follows tiffin-grab (`orders`/`payments`/`ledger_entries`) — never a `website_` prefix.
- **Never rewrite an applied migration.** New migrations only.
- `rg`/`fd` over `grep`/`find`. Comment the non-obvious *why* only.
- Verify gate after every task: `pnpm turbo typecheck`. Full gate at the end: `pnpm turbo typecheck && pnpm turbo test`.
- Local test harness: puchkaman integration tests hit local pg at `postgres://lawbringr@localhost:5432/puchkaman` via `vitest.config` `test.env`. Apply new migrations to the local DB before running them. Scope test cleanup to the test's own identifiers — never wipe a shared table.
- AWS: the `default` profile is root and can do everything; `realm-admin` has `realm-ses-read` (read-only SES). Task 10 needs SES/SNS **write**, so it either runs on `default` or gets a scoped policy first.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `apps/puchkaman/db/schema/notifications.ts` | Factory call + table re-exports |
| `apps/puchkaman/lib/notifications/tables.ts` | `notificationTables` + `usersRef` binding |
| `apps/puchkaman/lib/notifications/enqueue.ts` | Per-event channel defaults |
| `apps/puchkaman/lib/notifications/handlers.ts` | SES provider adapter + SSE broadcast |
| `apps/puchkaman/lib/notifications/drain.ts` | Drain binder with rate limiter |
| `apps/puchkaman/lib/notifications/feed.ts` | `currentUserId`, feed binders |
| `apps/puchkaman/lib/notifications/broadcast.ts` | Publish a ping on the memory bus |
| `apps/puchkaman/lib/notifications/suppression.ts` | Address suppression binder |
| `apps/puchkaman/lib/customers/upsert-customer.ts` | Guest → `users` row provisioning |
| `apps/puchkaman/lib/realtime/authorize.ts` | Channel authorization for SSE |
| `apps/puchkaman/lib/email/audited-provider.ts` | `email_log`-wrapping provider |
| `apps/puchkaman/db/schema/email-log.ts` | `email_log` table |
| `apps/puchkaman/workers/notify-drainer.ts` | Polling drainer loop |
| `apps/puchkaman/app/api/realtime/route.ts` | SSE stream |
| `apps/puchkaman/app/api/notifications/route.ts` | Feed read + mark-read |
| `apps/puchkaman/app/api/notifications/drain/route.ts` | Manual drain kick |
| `apps/puchkaman/app/api/notifications/templates/{route,preview/route,test/route}.ts` | Template CRUD + preview + test send |
| `apps/puchkaman/app/api/webhooks/ses/route.ts` | SNS feedback endpoint |
| `apps/puchkaman/app/(dashboard)/dashboard/notifications/**` | Admin UI pages |
| `apps/puchkaman/components/notifications/realtime.ts` | SSE subscriber for the bell |

**Modified**

| File | Change |
| --- | --- |
| `apps/puchkaman/db/schema/auth.ts` | `locale` enum, `users.locale`, `users.phone`, `users.phoneVerified` |
| `apps/puchkaman/db/schema/index.ts` | Export the new modules |
| `apps/puchkaman/db/schema/app.ts` *(or a new module)* | `app_event` enum |
| `apps/puchkaman/lib/auth/index.ts` | Reject `role: "user"` in `session.create.before` |
| `apps/puchkaman/lib/services/orders.service.ts` | Emit `order_placed`, `order_paid`, `order_cancelled`, `payment_failed` |
| `apps/puchkaman/app/api/catering-inquiries/route.ts` | Provision + emit `catering_inquiry` |
| `apps/puchkaman/app/(dashboard)/dashboard/layout.tsx` | Mount the bell |
| `apps/puchkaman/components/dashboard/app-sidebar.tsx` | Notifications nav entry |
| `apps/puchkaman/next.config.ts` | `transpilePackages` |
| `apps/puchkaman/package.json` | Workspace dependency |
| `deployment/prod/puchkaman/docker-compose.yml` | `drainer` service |
| `deployment/prod/puchkaman/.env.production.example` | New env vars |
| `deployment/email/ses-puchkaman.yaml` | SNS topic + event destination |

---

## Task 1: Users gain locale, phone, and a customer provisioning path

**Files:**
- Modify: `apps/puchkaman/db/schema/auth.ts`
- Create: `apps/puchkaman/lib/customers/upsert-customer.ts`
- Create: `apps/puchkaman/db/migrations/<generated>.sql`
- Test: `apps/puchkaman/lib/customers/__tests__/upsert-customer.test.ts`

**Interfaces:**
- Consumes: nothing from Plan A.
- Produces: `locale` pgEnum; `users.locale`, `users.phone`, `users.phoneVerified` columns; `upsertCustomer(tx, input: { email: string; name?: string | null; phone?: string | null }): Promise<bigint>` returning the user id.

- [ ] **Step 1: Add the columns to the auth schema**

In `apps/puchkaman/db/schema/auth.ts`, add above the `users` table:

```ts
// Template locale. `en` only today; the column exists so notification_template's
// (event, channel, locale) key has a real domain and adding a language later is
// a migration rather than a redesign.
export const locale = pgEnum("locale", ["en", "fr"]);
```

and inside the `users` column list, after `image`:

```ts
    locale: locale("locale").notNull().default("en"),
    // Customers arrive by guest checkout, so the phone is the order's phone
    // until someone verifies it. Unverified numbers must never receive SMS.
    phone: text("phone"),
    phoneVerified: boolean("phone_verified").notNull().default(false),
```

Update the comment block above `userRole` — it currently claims orders never provision an account here, which this plan changes:

```ts
// Staff sign in; customers do not. "admin" and "member" are staff roles. "user" is
// a CUSTOMER record provisioned by checkout so notifications and orders have an
// owner — it is created with NO credential row and is rejected outright by the
// session.create.before hook, so it can never obtain a session.
export const userRole = pgEnum("user_role", ["admin", "member", "user"]);
```

- [ ] **Step 2: Write the failing test**

`apps/puchkaman/lib/customers/__tests__/upsert-customer.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { upsertCustomer } from "@/lib/customers/upsert-customer";

const MARK = "upsert-cust";
const emails: string[] = [];

async function make(email: string, name?: string, phone?: string): Promise<bigint> {
  emails.push(email.toLowerCase());
  return db.transaction((tx) => upsertCustomer(tx, { email, name, phone }));
}

afterEach(async () => {
  if (emails.length) await db.delete(users).where(inArray(users.email, emails));
  emails.length = 0;
});

describe("upsertCustomer", () => {
  it("creates a customer with no credential and the user role", async () => {
    const id = await make(`${MARK}-a@example.test`, "Ada");
    const [row] = await db
      .select({ role: users.role, status: users.status, passwordSet: users.passwordSet, name: users.name })
      .from(users)
      .where(eq(users.id, id));
    expect(row).toEqual({ role: "user", status: "active", passwordSet: false, name: "Ada" });
  });

  it("is idempotent on the email and returns the same id", async () => {
    const email = `${MARK}-b@example.test`;
    const first = await make(email, "Ada");
    const second = await db.transaction((tx) => upsertCustomer(tx, { email, name: "Ada" }));
    expect(second).toBe(first);
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  it("normalizes the email to lowercase", async () => {
    const id = await make(`${MARK}-C@Example.TEST`);
    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
    expect(row.email).toBe(`${MARK.toLowerCase()}-c@example.test`);
  });

  it("fills a missing name or phone on a later order without overwriting an existing one", async () => {
    const email = `${MARK}-d@example.test`;
    const id = await make(email, undefined, undefined);
    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Grace", phone: "+14165550134" }));
    const [row] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, id));
    expect(row).toEqual({ name: "Grace", phone: "+14165550134" });

    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Typo", phone: "+10000000000" }));
    const [after] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, id));
    expect(after).toEqual({ name: "Grace", phone: "+14165550134" });
  });

  it("never promotes an existing staff account", async () => {
    const email = `${MARK}-e@example.test`;
    emails.push(email);
    await db.insert(users).values({ email, name: "Staff", role: "admin", status: "active" });
    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Impostor" }));
    const [row] = await db.select({ role: users.role, name: users.name }).from(users).where(eq(users.email, email));
    expect(row).toEqual({ role: "admin", name: "Staff" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test lib/customers/__tests__/upsert-customer.test.ts`
Expected: FAIL — cannot resolve `@/lib/customers/upsert-customer`.

- [ ] **Step 4: Write `lib/customers/upsert-customer.ts`**

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface UpsertCustomerInput {
  email: string;
  name?: string | null;
  phone?: string | null;
}

/**
 * Find-or-create the `users` row that owns a guest order.
 *
 * The account is deliberately unusable for sign-in: role `user`, no `account`
 * row (so no credential exists), and the session.create.before hook rejects the
 * role outright. It exists so notifications have a recipient and orders have an
 * owner — not to give customers a login.
 *
 * Called inside the caller's transaction so a customer is never created for an
 * order that rolls back.
 */
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
    // COALESCE keeps the stored value when it is already set: a later order with
    // a typo'd name must not overwrite the good one, and this must never touch
    // `role` — an existing staff account sharing the address stays staff.
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: sql`coalesce(${users.name}, excluded.name)`,
        phone: sql`coalesce(${users.phone}, excluded.phone)`,
      },
    })
    .returning({ id: users.id });

  if (row) return row.id;

  // onConflictDoUpdate returns a row in every supported path; this is a defensive
  // read for the partial-index edge where the conflict target does not match.
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
  return existing.id;
}
```

- [ ] **Step 5: Generate and apply the migration**

```bash
pnpm --filter puchkaman exec drizzle-kit generate
pnpm --filter puchkaman exec drizzle-kit migrate
```

Expected generated SQL: `CREATE TYPE "locale"`, and `ALTER TABLE "users"` adding `locale`, `phone`, `phone_verified`. Nothing else.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test lib/customers/__tests__/upsert-customer.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/db apps/puchkaman/lib/customers
git commit -m "feat(puchkaman): provision customer users from guest checkout

Customers get a users row with role=user and no account row, so orders and
notifications have an owner while sign-in stays impossible. COALESCE on
update keeps a good stored name from being overwritten by a later typo and
never touches role, so a staff address cannot be demoted."
```

---

## Task 2: Close the login path for the customer role

**Files:**
- Modify: `apps/puchkaman/lib/auth/index.ts`
- Test: `apps/puchkaman/lib/auth/__tests__/customer-login-gate.test.ts`

**Interfaces:**
- Consumes: `users.role` (Task 1).
- Produces: no new exports — a behavioural guard in `databaseHooks.session.create.before`.

`requireStaff` and the permission map already reject `role: "user"`, but the session hook is the single choke point that covers every sign-in method at once, including any email-OTP flow added later.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/lib/auth/__tests__/customer-login-gate.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { assertSessionAllowed } from "@/lib/auth/index";

const MARK = "login-gate";
const emails: string[] = [];

async function make(email: string, role: "admin" | "member" | "user", status = "active" as const) {
  emails.push(email);
  const [u] = await db
    .insert(users)
    .values({ email, name: MARK, role, status })
    .returning({ id: users.id });
  return u.id;
}

afterEach(async () => {
  if (emails.length) await db.delete(users).where(inArray(users.email, emails));
  emails.length = 0;
});

describe("assertSessionAllowed", () => {
  it("allows an active admin", async () => {
    const id = await make(`${MARK}-a@example.test`, "admin");
    await expect(assertSessionAllowed(id)).resolves.toBeUndefined();
  });

  it("allows an active member", async () => {
    const id = await make(`${MARK}-b@example.test`, "member");
    await expect(assertSessionAllowed(id)).resolves.toBeUndefined();
  });

  it("rejects a customer even when active", async () => {
    const id = await make(`${MARK}-c@example.test`, "user");
    await expect(assertSessionAllowed(id)).rejects.toThrow(/not active|no sign-in/i);
  });

  it("rejects a suspended staff account", async () => {
    const id = await make(`${MARK}-d@example.test`, "admin", "suspended" as never);
    await expect(assertSessionAllowed(id)).rejects.toThrow(/not active/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test lib/auth/__tests__/customer-login-gate.test.ts`
Expected: FAIL — `assertSessionAllowed` is not exported.

- [ ] **Step 3: Extract and extend the hook body**

In `apps/puchkaman/lib/auth/index.ts`, add above the `betterAuth({...})` call:

```ts
/**
 * Sign-in gate. Only an ACTIVE STAFF account may obtain a session.
 *
 * Runs after the credential check but before a session row is written, so it
 * covers every sign-in method at once rather than each route separately.
 * `role: "user"` is a customer record provisioned by checkout — it has no
 * credential, but this is the guard that must hold if one is ever added.
 * Exported for tests.
 */
export async function assertSessionAllowed(userId: bigint): Promise<void> {
  const [u] = await db
    .select({ status: users.status, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return;
  if (u.role === "user") {
    throw new APIError("FORBIDDEN", { message: "This account has no sign-in access." });
  }
  if (u.status !== "active") {
    throw new APIError("FORBIDDEN", { message: "This account is not active. Contact an administrator." });
  }
}
```

Then replace the body of `databaseHooks.session.create.before` with:

```ts
        before: async (sess) => {
          await assertSessionAllowed(BigInt(sess.userId as string));
```

keeping whatever the existing hook returns after the check.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test lib/auth/__tests__/customer-login-gate.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/lib/auth
git commit -m "feat(puchkaman): reject the customer role at the session gate

Customer records have no credential today, so nothing can sign in as one --
this is the guard that has to hold when an OTP or social flow is added,
because those mint a session without ever consulting the account table."
```

---

## Task 3: Event enum, notification tables, and the app binders

**Files:**
- Create: `apps/puchkaman/db/schema/events.ts`
- Create: `apps/puchkaman/db/schema/notifications.ts`
- Create: `apps/puchkaman/db/schema/email-log.ts`
- Modify: `apps/puchkaman/db/schema/index.ts`
- Modify: `apps/puchkaman/package.json`, `apps/puchkaman/next.config.ts`
- Create: `apps/puchkaman/lib/notifications/{tables,broadcast,enqueue,handlers,drain,feed,suppression}.ts`
- Create: `apps/puchkaman/lib/email/audited-provider.ts`
- Create: `apps/puchkaman/db/migrations/<generated>.sql`

**Interfaces:**
- Consumes: `makeNotificationTables`, `enqueue`, `enqueueToRole`, `buildHandlers`, `drainPending`, `createRateLimiter`, `getFeed`, `markRead`, `suppress` (Plan A).
- Produces: `appEvent` pgEnum; `notificationTables`; `usersRef`; `enqueueNotification(tx, input)`; `enqueueStaff(tx, input)`; `buildAppHandlers()`; `drainPending()`; `currentUserId()`; `getFeed(userId)`; `markRead(userId, ids?)`; `suppressEmailRecipient(email, reason)`; `broadcastNotification(input)`; `emailLog` table; `getAuditedEmailProvider()`.

- [ ] **Step 1: Add the dependency and transpile entry**

In `apps/puchkaman/package.json` `dependencies`, add `"@realm/notifications": "workspace:*",`. In `apps/puchkaman/next.config.ts`, add `"@realm/notifications"` to `transpilePackages`. Run `pnpm install`.

- [ ] **Step 2: Write the event enum**

`apps/puchkaman/db/schema/events.ts`:

```ts
import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Business events that can produce a notification. Matched to the real
 * order_status and payment_status lifecycles, not tiffin-grab's subscription
 * ones — puchkaman sells single pickup/delivery orders.
 */
export const appEvent = pgEnum("app_event", [
  "order_placed",
  "order_paid",
  "order_fulfilled",
  "order_cancelled",
  "payment_failed",
  "refund_issued",
  "catering_inquiry",
  "contact_message",
  "signup",
]);
```

- [ ] **Step 3: Write the schema modules**

`apps/puchkaman/db/schema/notifications.ts`:

```ts
import { makeNotificationTables } from "@realm/notifications/schema";
import { locale, users } from "./auth";
import { appEvent } from "./events";

export const notificationTables = makeNotificationTables({ users, appEvent, locale });

export const {
  notificationChannel,
  outboxStatus,
  messageKind,
  notifications,
  notificationOutbox,
  notificationPrefs,
  notificationTemplate,
  messageSuppression,
} = notificationTables;
```

`apps/puchkaman/db/schema/email-log.ts` — copy the shape from tiffin-grab so the admin Emails page is identical:

```ts
import { baseColumns } from "@realm/database";
import { index, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Every send attempt, for the admin Emails page and for correlating a provider
 * id back to a recipient. Puchkaman had no audit trail at all before this.
 */
export const emailLog = pgTable(
  "email_log",
  {
    ...baseColumns("eml"),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull(),
    error: text("error"),
  },
  (t) => [index("email_log_created_idx").on(t.createdAt)],
);
```

Before writing this file, run `cat apps/tiffin-grab/db/schema/email-log.ts` and match its columns exactly — the shared admin UI reads them by name.

In `apps/puchkaman/db/schema/index.ts`, add:

```ts
export * from "./events";
export * from "./notifications";
export * from "./email-log";
```

- [ ] **Step 4: Write the tables binding**

`apps/puchkaman/lib/notifications/tables.ts`:

```ts
import type { UsersRef } from "@realm/notifications";
import { notificationTables, users } from "@/db/schema";

export { notificationTables };

/**
 * No `notifyEmail` column here — that is a tiffin-grab legacy opt-in. Puchkaman
 * expresses the same thing through notification_prefs, which is per-kind and so
 * cannot silence a receipt.
 */
export const usersRef: UsersRef = {
  table: users,
  columns: {
    id: users.id,
    email: users.email,
    role: users.role,
    status: users.status,
    phone: users.phone,
  },
};
```

- [ ] **Step 5: Write the broadcast transport**

`apps/puchkaman/lib/notifications/broadcast.ts`:

```ts
import { memoryBus } from "@realm/realtime/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** SSE channel a user's bell subscribes to. */
export function notifyChannel(userPublicId: string): string {
  return `notify:${userPublicId}`;
}

/**
 * Live "something new" ping. @realm/realtime's message frame carries no payload,
 * so the bell refetches the feed rather than being handed the row — which also
 * keeps the notification body off a transport with no per-frame authorization.
 *
 * Single instance, so the in-process memory bus reaches every open stream. A
 * RedisBus adapter (same Bus interface) is what a second instance would need.
 */
export async function broadcastNotification(input: { userId: bigint }): Promise<void> {
  const [u] = await db
    .select({ publicId: users.publicId })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!u) return;
  memoryBus.publish(notifyChannel(u.publicId), { type: "message", channel: notifyChannel(u.publicId) });
}
```

- [ ] **Step 6: Write the audited email provider**

`apps/puchkaman/lib/email/audited-provider.ts`:

```ts
import type { EmailProvider } from "@realm/email";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { emailLog } from "@/db/schema";
import { getEmailProvider } from "./provider";

const log = createLogger("email-audit");

/**
 * Wrap the SES provider so every attempt lands in email_log. Logging failures
 * are swallowed: an audit write must never be the reason a receipt is not sent.
 */
export function getAuditedEmailProvider(): EmailProvider {
  const inner = getEmailProvider();
  return {
    ...inner,
    async send(message) {
      const to = Array.isArray(message.to) ? message.to[0].email : message.to.email;
      try {
        const result = await inner.send(message);
        await db
          .insert(emailLog)
          .values({
            toEmail: to,
            subject: message.subject,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            status: "sent",
          })
          .catch((err) => log.error({ err }, "email_log write failed"));
        return result;
      } catch (err) {
        await db
          .insert(emailLog)
          .values({
            toEmail: to,
            subject: message.subject,
            provider: "ses",
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          })
          .catch((e) => log.error({ err: e }, "email_log write failed"));
        throw err;
      }
    },
  } as EmailProvider;
}
```

- [ ] **Step 7: Write the enqueue, handlers, drain, feed and suppression binders**

`apps/puchkaman/lib/notifications/enqueue.ts`:

```ts
import { enqueue, enqueueToRole, type EnqueueInput, type EnqueueToRoleInput } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = (typeof notificationTables.notificationOutbox.event.enumValues)[number];
type Channel = (typeof notificationTables.notificationOutbox.channel.enumValues)[number];

/**
 * Default channels per event. Customer-facing events are email-only: puchkaman
 * customers cannot sign in, so an in-app notification addressed to one would
 * have nowhere to appear.
 */
const EVENT_CHANNELS: Partial<Record<Event, Channel[]>> = {
  order_placed: ["email"],
  order_paid: ["email"],
  order_fulfilled: ["email"],
  order_cancelled: ["email"],
  refund_issued: ["email"],
};

/** Staff-facing events go to the in-app feed of every active admin/member. */
const STAFF_CHANNELS: Channel[] = ["in_app"];
const STAFF_ROLES = ["admin", "member"];

export function enqueueNotification(tx: Tx, input: EnqueueInput & { event: Event }): Promise<void> {
  return enqueue(tx, notificationTables, usersRef, {
    ...input,
    channels: input.channels ?? EVENT_CHANNELS[input.event] ?? ["email"],
  });
}

export function enqueueStaff(tx: Tx, input: Omit<EnqueueToRoleInput, "roles"> & { event: Event }): Promise<void> {
  return enqueueToRole(tx, notificationTables, usersRef, {
    ...input,
    roles: STAFF_ROLES,
    channels: input.channels ?? STAFF_CHANNELS,
  });
}
```

`apps/puchkaman/lib/notifications/handlers.ts`:

```ts
import { buildHandlers, type ChannelProvider } from "@realm/notifications";
import { getAuditedEmailProvider } from "@/lib/email/audited-provider";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { broadcastNotification } from "./broadcast";

/** Adapt @realm/email's EmailProvider to the package's ChannelProvider shape. */
function emailChannelProvider(): ChannelProvider {
  const provider = getAuditedEmailProvider();
  return {
    send: (msg) =>
      provider.send({
        to: { email: msg.to.email! },
        subject: msg.subject!,
        html: msg.html,
        text: msg.text,
      }),
  };
}

export function buildAppHandlers() {
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: { email: emailChannelProvider() },
    broadcast: (input) => broadcastNotification({ userId: input.userId }),
  });
}
```

`apps/puchkaman/lib/notifications/drain.ts`:

```ts
import { createRateLimiter, drainPending as drain } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables } from "./tables";
import { buildAppHandlers } from "./handlers";

// SES MaxSendRate on this account is 14/s and is shared with tiffin-grab, so
// each app stays well under it — throttling damages sender reputation.
const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 5);

export function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    { db, tables: notificationTables, handlers: buildAppHandlers(), rateLimiter: createRateLimiter(SEND_RATE) },
    limit,
    maxBatches,
  );
}
```

`apps/puchkaman/lib/notifications/feed.ts`:

```ts
import { eq } from "drizzle-orm";
import { getFeed as pkgGetFeed, markRead as pkgMarkRead, type FeedItem } from "@realm/notifications";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { notificationTables } from "./tables";

export type { FeedItem };

export async function currentUserId(): Promise<bigint | null> {
  const publicId = (await getSession())?.user?.id;
  if (!publicId) return null;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId));
  return row?.id ?? null;
}

export const getFeed = (userId: bigint) => pkgGetFeed(db, notificationTables, userId);
export const markRead = (userId: bigint, publicIds?: string[]) =>
  pkgMarkRead(db, notificationTables, userId, publicIds);
```

`apps/puchkaman/lib/notifications/suppression.ts`:

```ts
import { suppress } from "@realm/notifications";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { notificationTables } from "./tables";

const log = createLogger("ses-suppression");

export async function suppressEmailRecipient(email: string, reason: string): Promise<boolean> {
  await suppress(db, notificationTables, { address: email, channel: "email", reason });
  log.info(`suppressed email channel for a bounced/complained address: ${reason}`);
  return true;
}
```

- [ ] **Step 8: Generate and apply the migration**

```bash
pnpm --filter puchkaman exec drizzle-kit generate
pnpm --filter puchkaman exec drizzle-kit migrate
```

Expected: `CREATE TYPE` for `app_event`, `notification_channel`, `notification_outbox_status`, `message_kind`; `CREATE TABLE` for `notifications`, `notification_outbox`, `notification_prefs`, `notification_template`, `message_suppression`, `email_log`; plus their indexes. Nothing touching an existing table.

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter puchkaman typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/puchkaman/db apps/puchkaman/lib apps/puchkaman/package.json apps/puchkaman/next.config.ts pnpm-lock.yaml
git commit -m "feat(puchkaman): notification tables, event enum and app binders

Customer-facing events default to email only -- customers cannot sign in, so
an in-app notification addressed to one has nowhere to appear. Staff events
fan out to the in-app feed of every active admin/member instead."
```

---

## Task 4: Emit order events

**Files:**
- Modify: `apps/puchkaman/lib/services/orders.service.ts`
- Test: `apps/puchkaman/lib/services/__tests__/order-events.integration.test.ts`

**Interfaces:**
- Consumes: `enqueueNotification`, `enqueueStaff` (Task 3), `upsertCustomer` (Task 1).
- Produces: no new exports — outbox rows written inside the existing transactions.

Every emission goes **inside the transaction that already exists** at that state change, so a notification can never describe a change that rolled back.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/lib/services/__tests__/order-events.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, orders, users } from "@/db/schema";
import { upsertCustomer } from "@/lib/customers/upsert-customer";
import { enqueueNotification, enqueueStaff } from "@/lib/notifications/enqueue";

const MARK = "order-events";
const userIds: bigint[] = [];

afterEach(async () => {
  if (userIds.length) {
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    userIds.length = 0;
  }
});

describe("order event emission", () => {
  it("queues a customer email for order_placed", async () => {
    const id = await db.transaction(async (tx) => {
      const uid = await upsertCustomer(tx, { email: `${MARK}-a@example.test`, name: "Ada" });
      await enqueueNotification(tx, {
        event: "order_placed",
        recipientId: uid,
        title: "Order received",
        body: "We got your order.",
        data: { order: { publicId: "ord_test", total: "12.34" } },
        dedupeKey: "ord_test:order_placed",
      });
      return uid;
    });
    userIds.push(id);

    const rows = await db
      .select({ channel: notificationOutbox.channel, event: notificationOutbox.event, kind: notificationOutbox.kind })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows).toEqual([{ channel: "email", event: "order_placed", kind: "transactional" }]);
  });

  it("is idempotent on the dedupe key", async () => {
    const id = await db.transaction((tx) => upsertCustomer(tx, { email: `${MARK}-b@example.test` }));
    userIds.push(id);
    for (let i = 0; i < 2; i++) {
      await db.transaction((tx) =>
        enqueueNotification(tx, {
          event: "order_paid",
          recipientId: id,
          title: "Paid",
          body: "Thanks.",
          dedupeKey: "ord_dup:order_paid",
        }),
      );
    }
    const rows = await db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows).toHaveLength(1);
  });

  it("writes nothing when the surrounding transaction rolls back", async () => {
    const email = `${MARK}-c@example.test`;
    await expect(
      db.transaction(async (tx) => {
        const uid = await upsertCustomer(tx, { email });
        await enqueueNotification(tx, {
          event: "order_placed",
          recipientId: uid,
          title: "t",
          body: "b",
        });
        throw new Error("simulated failure after enqueue");
      }),
    ).rejects.toThrow("simulated failure");

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);
  });

  it("fans a staff event out to every active admin and member", async () => {
    const a = await db
      .insert(users)
      .values({ email: `${MARK}-staff1@example.test`, name: MARK, role: "admin", status: "active" })
      .returning({ id: users.id });
    const b = await db
      .insert(users)
      .values({ email: `${MARK}-staff2@example.test`, name: MARK, role: "member", status: "active" })
      .returning({ id: users.id });
    userIds.push(a[0].id, b[0].id);

    await db.transaction((tx) =>
      enqueueStaff(tx, { event: "order_placed", title: "New order", body: "ord_test", dedupeKey: "ord_test:staff" }),
    );

    const rows = await db
      .select({ recipientId: notificationOutbox.recipientId, channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(inArray(notificationOutbox.recipientId, [a[0].id, b[0].id]));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.channel === "in_app")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test lib/services/__tests__/order-events.integration.test.ts`
Expected: FAIL — `@/lib/notifications/enqueue` resolves but the tables do not exist unless Task 3's migration ran. If it errors on a missing relation, apply the migration first.

- [ ] **Step 3: Emit `order_placed` in `createCheckout`**

In `apps/puchkaman/lib/services/orders.service.ts`, add the imports:

```ts
import { upsertCustomer } from "@/lib/customers/upsert-customer";
import { enqueueNotification, enqueueStaff } from "@/lib/notifications/enqueue";
```

Inside the `db.transaction(async (tx) => {` block that begins at the `insert(orders)` call, provision the customer **before** the order insert and set `userId` on it:

```ts
      const customerId = await upsertCustomer(tx, {
        email: parsed.contact.email,
        name: parsed.contact.name,
        phone: parsed.contact.phone ?? null,
      });

      const [row] = await tx
        .insert(orders)
        .values({
          status: "pending",
          userId: customerId,
          fulfillment,
          // …the rest of the existing values object, unchanged
```

Then, immediately before `return row;` at the end of that same transaction:

```ts
      // Same txn as the order insert: a receipt must never describe an order
      // that rolled back.
      await enqueueNotification(tx, {
        event: "order_placed",
        recipientId: customerId,
        title: "We got your order",
        body: `Order ${row.publicId}`,
        href: `/track?order=${row.publicId}`,
        data: { order: { publicId: row.publicId, total: String(row.total), name: parsed.contact.name } },
        dedupeKey: `${row.publicId}:order_placed`,
      });
      await enqueueStaff(tx, {
        event: "order_placed",
        title: "New order",
        body: `${parsed.contact.name} — ${row.publicId}`,
        href: `/dashboard/orders/${row.publicId}`,
        dedupeKey: `${row.publicId}:order_placed:staff`,
      });
```

- [ ] **Step 4: Emit `order_paid` in `settlePaid`**

In `settlePaid`, immediately after the `update(orders).set({ status: "paid", paidAt: now })` statement:

```ts
    if (order.userId) {
      await enqueueNotification(tx, {
        event: "order_paid",
        recipientId: order.userId,
        title: "Payment received",
        body: `Order ${order.publicId}`,
        href: `/track?order=${order.publicId}`,
        data: { order: { publicId: order.publicId, total: String(order.total) } },
        dedupeKey: `${order.publicId}:order_paid`,
      });
    }
    await enqueueStaff(tx, {
      event: "order_paid",
      title: "Order paid",
      body: order.publicId,
      href: `/dashboard/orders/${order.publicId}`,
      dedupeKey: `${order.publicId}:order_paid:staff`,
    });
```

The `order.userId` guard matters: orders placed before Task 5's backfill have no owner, and `enqueue` would otherwise be handed `undefined`.

- [ ] **Step 5: Emit `payment_failed` in `markPaymentFailed`**

At the end of `markPaymentFailed`, on the path that returns `true`:

```ts
    // Staff-only: a customer who just saw the card decline does not need an email
    // about it, and a failed charge is an operational signal.
    await enqueueStaff(tx, {
      event: "payment_failed",
      title: "Payment failed",
      body: order.publicId,
      href: `/dashboard/orders/${order.publicId}`,
      dedupeKey: `${order.publicId}:payment_failed:${cloverChargeId ?? "none"}`,
    });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test lib/services/__tests__/order-events.integration.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 7: Run the existing orders suite for regressions**

Run: `pnpm --filter puchkaman test lib/services`
Expected: PASS. `createCheckout` now writes two extra rows per order inside its transaction; any test asserting an exact row count in `notification_outbox` or an exact `orders` insert shape needs updating, not silencing.

- [ ] **Step 8: Commit**

```bash
git add apps/puchkaman/lib/services
git commit -m "feat(puchkaman): emit order events into the notification outbox

Every emission sits inside the transaction that already exists at that state
change, so a receipt can never describe an order that rolled back. The
order.userId guard covers orders placed before the backfill."
```

---

## Task 5: Backfill customers from existing orders

**Files:**
- Create: `apps/puchkaman/db/migrations/<hand-written>.sql`

**Interfaces:**
- Consumes: `users.role` / `users.phone` (Task 1), `orders.user_id` (pre-existing).
- Produces: no code — a data migration.

Local dev is empty (`users=0 orders=0 payments=0`). **Production counts are unverified** — SSH to the puchkaman box was blocked during design. Confirm before running:

```bash
ssh ec2-user@3.235.5.222 'docker run --rm postgres:18-alpine psql "$DB_URL" -Atc "select count(*) from orders"'
```

The migration is idempotent and correct either way, but you should know what it will touch.

- [ ] **Step 1: Create the migration file**

Generate an empty migration to get a correctly-numbered filename and journal entry:

```bash
pnpm --filter puchkaman exec drizzle-kit generate --custom --name backfill_customer_users
```

- [ ] **Step 2: Write the SQL**

```sql
-- Provision a customer users row for every distinct order email that does not
-- already have an account, then link the orders to it.
--
-- Idempotent: the insert skips addresses that already exist (including staff
-- accounts, which must keep their role), and the update only fills a null
-- user_id. Safe to re-run.
INSERT INTO "users" ("email", "name", "phone", "role", "status", "password_set")
SELECT DISTINCT ON (lower(o."customer_email"))
       lower(o."customer_email"),
       o."customer_name",
       o."customer_phone",
       'user',
       'active',
       false
FROM "orders" o
WHERE o."customer_email" IS NOT NULL
  AND o."customer_email" <> ''
ORDER BY lower(o."customer_email"), o."created_at" DESC
ON CONFLICT ("email") DO NOTHING;
--> statement-breakpoint
UPDATE "orders" o
SET "user_id" = u."id"
FROM "users" u
WHERE o."user_id" IS NULL
  AND u."email" = lower(o."customer_email");
```

`DISTINCT ON … ORDER BY created_at DESC` takes the **most recent** name and phone for a repeat customer, which is the one most likely to still be correct.

- [ ] **Step 3: Apply and verify locally**

```bash
pnpm --filter puchkaman exec drizzle-kit migrate
psql postgres://lawbringr@localhost:5432/puchkaman -Atc \
  "select count(*) from users where role='user'"
psql postgres://lawbringr@localhost:5432/puchkaman -Atc \
  "select count(*) from orders where user_id is null and customer_email is not null"
```

Expected on an empty local database: `0` and `0`. On a database with orders, the second query must be `0` — every order with an email now has an owner.

- [ ] **Step 4: Verify idempotence**

Re-run the migration SQL by hand against the local database and confirm the counts are unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/db/migrations
git commit -m "feat(puchkaman): backfill customer users from existing orders

DISTINCT ON with created_at DESC takes the most recent name and phone for a
repeat customer. ON CONFLICT DO NOTHING protects staff accounts that share an
address -- they keep their role."
```

---

## Task 6: SSE realtime and the feed API

**Files:**
- Create: `apps/puchkaman/lib/realtime/authorize.ts`
- Create: `apps/puchkaman/app/api/realtime/route.ts`
- Create: `apps/puchkaman/app/api/notifications/route.ts`
- Create: `apps/puchkaman/components/notifications/realtime.ts`
- Test: `apps/puchkaman/lib/realtime/__tests__/authorize.test.ts`

**Interfaces:**
- Consumes: `notifyChannel` (Task 3), `currentUserId`/`getFeed`/`markRead` (Task 3), `UseNotificationsOptions` (Plan A Task 11).
- Produces: `authorizeChannel(channel: string): Promise<{ channel: string; userId: string; role: RealtimeRole } | null>`; `GET /api/realtime`; `GET|POST /api/notifications`; `subscribeNotifications` matching Plan A's `subscribe` prop.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/lib/realtime/__tests__/authorize.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { parseNotifyChannel } from "@/lib/realtime/authorize";

describe("parseNotifyChannel", () => {
  it("extracts the user public id", () => {
    expect(parseNotifyChannel("notify:usr_abc123")).toBe("usr_abc123");
  });

  it("rejects a channel of another kind", () => {
    expect(parseNotifyChannel("ticket:tkt_abc")).toBeNull();
  });

  it("rejects a malformed channel", () => {
    expect(parseNotifyChannel("notify:")).toBeNull();
    expect(parseNotifyChannel("notify")).toBeNull();
    expect(parseNotifyChannel("")).toBeNull();
  });

  it("rejects an id with a separator in it", () => {
    expect(parseNotifyChannel("notify:usr_a:usr_b")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test lib/realtime/__tests__/authorize.test.ts`
Expected: FAIL — cannot resolve `@/lib/realtime/authorize`.

- [ ] **Step 3: Write the authorizer**

`apps/puchkaman/lib/realtime/authorize.ts`:

```ts
import type { RealtimeRole } from "@realm/realtime";
import { getSession } from "@/lib/auth/session";

/** Extract the user public id from a `notify:<publicId>` channel, or null. */
export function parseNotifyChannel(channel: string): string | null {
  const parts = channel.split(":");
  if (parts.length !== 2) return null;
  const [kind, id] = parts;
  if (kind !== "notify" || !id) return null;
  return id;
}

/**
 * A user may subscribe to their OWN notify channel and no other. The channel
 * name contains the target's public id, so without this check any signed-in
 * user could read every other user's live pings.
 */
export async function authorizeChannel(
  channel: string,
): Promise<{ channel: string; userId: string; role: RealtimeRole } | null> {
  const target = parseNotifyChannel(channel);
  if (!target) return null;

  const session = await getSession();
  const publicId = session?.user?.id;
  if (!publicId || publicId !== target) return null;

  return { channel, userId: publicId, role: "staff" };
}
```

- [ ] **Step 4: Write the SSE route**

`apps/puchkaman/app/api/realtime/route.ts`:

```ts
import { sseResponse } from "@realm/realtime/server";
import { authorizeChannel } from "@/lib/realtime/authorize";

export async function GET(request: Request): Promise<Response> {
  const channel = new URL(request.url).searchParams.get("channel");
  if (!channel) return new Response("Missing channel", { status: 400 });

  const auth = await authorizeChannel(channel);
  if (!auth) return new Response("Forbidden", { status: 403 });

  return sseResponse({ channel: auth.channel, userId: auth.userId, role: auth.role });
}
```

- [ ] **Step 5: Write the feed route**

`apps/puchkaman/app/api/notifications/route.ts`:

```ts
import { handler, problem } from "@realm/routes";
import { currentUserId, getFeed, markRead } from "@/lib/notifications/feed";

export const GET = handler(async (): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  return Response.json(await getFeed(userId));
});

export const POST = handler(async (req: Request): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  const body = (await req.json().catch(() => ({}))) as { publicIds?: string[] };
  return Response.json({ marked: await markRead(userId, body.publicIds) });
});
```

- [ ] **Step 6: Write the client subscriber**

`apps/puchkaman/components/notifications/realtime.ts`:

```ts
"use client";

/**
 * SSE transport for the bell. @realm/realtime's message frame carries no
 * payload, so this calls back with nothing and the hook refetches the feed.
 * Auth rides the session cookie (same-origin EventSource).
 */
export function makeSubscriber(userPublicId: string) {
  return async (onEvent: () => void): Promise<() => void> => {
    const channel = `notify:${userPublicId}`;
    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(channel)}`);
    source.onmessage = () => onEvent();
    return () => source.close();
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test lib/realtime/__tests__/authorize.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/puchkaman/lib/realtime apps/puchkaman/app/api/realtime apps/puchkaman/app/api/notifications apps/puchkaman/components/notifications
git commit -m "feat(puchkaman): SSE realtime channel and notification feed API

The channel name contains the target user id, so authorizeChannel pins it to
the caller's own session -- otherwise any signed-in user could read every
other user's live pings."
```

---

## Task 7: Drainer worker and compose service

**Files:**
- Create: `apps/puchkaman/workers/notify-drainer.ts`
- Create: `apps/puchkaman/app/api/notifications/drain/route.ts`
- Modify: `deployment/prod/puchkaman/docker-compose.yml`
- Modify: `deployment/prod/puchkaman/.env.production.example`
- Test: `apps/puchkaman/workers/__tests__/notify-drainer.test.ts`

**Interfaces:**
- Consumes: `drainPending` (Task 3).
- Produces: `drainLoop(opts: { intervalMs: number; signal?: AbortSignal }): Promise<void>`; `POST /api/notifications/drain`.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/workers/__tests__/notify-drainer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { drainLoop } from "../notify-drainer";

describe("drainLoop", () => {
  it("keeps looping after a drain throws", async () => {
    const controller = new AbortController();
    let calls = 0;
    const drain = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient database blip");
      if (calls >= 3) controller.abort();
      return 0;
    });

    await drainLoop({ intervalMs: 0, signal: controller.signal, drain });
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const drain = vi.fn(async () => 0);
    await drainLoop({ intervalMs: 0, signal: controller.signal, drain });
    expect(drain).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test workers/__tests__/notify-drainer.test.ts`
Expected: FAIL — cannot resolve `../notify-drainer`.

- [ ] **Step 3: Write the worker**

`apps/puchkaman/workers/notify-drainer.ts`:

```ts
import { createLogger } from "@realm/commons/logger";
import { drainPending } from "@/lib/notifications/drain";

const log = createLogger("notify-drainer");

const INTERVAL_MS = Number(process.env.NOTIFY_DRAIN_INTERVAL_MS ?? 15_000);

export interface DrainLoopOptions {
  intervalMs: number;
  signal?: AbortSignal;
  /** Injected for tests. */
  drain?: () => Promise<number>;
}

/**
 * Poll the outbox forever.
 *
 * Postgres IS the queue — the outbox has FOR UPDATE SKIP LOCKED claiming,
 * backoff, attempt counting and a dead-letter status, so no broker is involved.
 * LISTEN/NOTIFY would remove the idle latency but is unusable here: pgbouncer
 * runs in transaction pooling mode and a LISTEN binds to a backend that gets
 * handed to the next client, silently dropping notifications.
 *
 * drainPending() already loops batches until the queue empties, so a burst
 * clears immediately; the interval only bounds idle latency.
 */
export async function drainLoop(opts: DrainLoopOptions): Promise<void> {
  const drain = opts.drain ?? (() => drainPending());
  while (!opts.signal?.aborted) {
    try {
      const n = await drain();
      if (n > 0) log.info({ processed: n }, "drained");
    } catch (err) {
      // The loop must never die: a transient database error would otherwise
      // leave every queued notification undelivered until the next deploy.
      log.error({ err }, "drain failed");
    }
    if (opts.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}

// Entry point when run directly (tsx workers/notify-drainer.ts).
if (process.argv[1]?.endsWith("notify-drainer.ts")) {
  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());
  drainLoop({ intervalMs: INTERVAL_MS, signal: controller.signal }).catch((err) => {
    log.error({ err }, "fatal");
    process.exit(1);
  });
}
```

- [ ] **Step 4: Write the manual kick route**

`apps/puchkaman/app/api/notifications/drain/route.ts`:

```ts
import { handler, problem } from "@realm/routes";
import { drainPending } from "@/lib/notifications/drain";

/**
 * Manual drain kick. The scheduled path is the `drainer` compose service; this
 * exists so an operator can flush the queue without shelling into the box.
 * Guarded by a shared secret so it cannot be invoked publicly.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const secret = process.env.DRAIN_SECRET;
  if (!secret || req.headers.get("x-drain-secret") !== secret) {
    return problem(403, "Forbidden");
  }
  return Response.json({ processed: await drainPending() });
});
```

- [ ] **Step 5: Add the compose service**

In `deployment/prod/puchkaman/docker-compose.yml`, after the `migrate` block and before the `networks:` block:

```yaml
  drainer:
    image: ${TOOLS_IMAGE:-ghcr.io/a6n-ai/puchkaman-tools}:${IMAGE_TAG:-latest}
    logging: *awslogs
    env_file: .env.production
    restart: unless-stopped
    command: ["pnpm", "--filter", "puchkaman", "exec", "tsx", "workers/notify-drainer.ts"]
```

Note this service has **no `profiles:` key** — unlike `migrate`, it must come up with the stack rather than being invoked as a one-shot tool.

- [ ] **Step 6: Add the env vars**

In `deployment/prod/puchkaman/.env.production.example`, near the other notification settings:

```
# Outbox drainer: shared secret for the manual POST /api/notifications/drain kick.
DRAIN_SECRET=change-me
# Idle poll interval for the drainer worker, milliseconds.
NOTIFY_DRAIN_INTERVAL_MS=15000
# Sends per second. The SES account MaxSendRate is 14/s and is shared with
# tiffin-grab, so each app stays well under it.
NOTIFY_SEND_RATE=5
# SES feedback topic, for the webhook's defense-in-depth TopicArn check.
SES_FEEDBACK_TOPIC_ARN=
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test workers/__tests__/notify-drainer.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/puchkaman/workers apps/puchkaman/app/api/notifications/drain deployment/prod/puchkaman
git commit -m "feat(puchkaman): outbox drainer worker and compose service

Polls rather than using LISTEN/NOTIFY: pgbouncer runs in transaction pooling
mode, where a LISTEN binds to a backend that gets handed to the next client
and notifications are silently lost."
```

---

## Task 8: Admin notification UI

**Files:**
- Create: `apps/puchkaman/app/(dashboard)/dashboard/notifications/{layout,page}.tsx`
- Create: `apps/puchkaman/app/(dashboard)/dashboard/notifications/templates/{page,[event]/page}.tsx`
- Create: `apps/puchkaman/app/(dashboard)/dashboard/notifications/{emails,logs}/page.tsx`
- Create: `apps/puchkaman/app/api/notifications/templates/{route,preview/route,test/route}.ts`
- Modify: `apps/puchkaman/components/dashboard/app-sidebar.tsx`

**Interfaces:**
- Consumes: `TemplateList`, `TemplateEditor`, `NotificationsNav`, `EmailEditorField` from `@realm/notifications/ui` (Plan A Task 11); `renderEmailForEvent`/`renderInAppForEvent` from `@realm/notifications`.
- Produces: routes under `/dashboard/notifications`.

Port the page shells from tiffin-grab rather than writing them fresh — the package UI expects specific props. Read each source before writing its puchkaman counterpart:

```bash
ls apps/tiffin-grab/app/\(dashboard\)/dashboard/notifications/
```

- [ ] **Step 1: Copy the page shells**

For each of `layout.tsx`, `page.tsx`, `templates/page.tsx`, `templates/[event]/page.tsx`, `emails/page.tsx`, `logs/page.tsx` and `logs/logs-table.tsx`, read the tiffin-grab file and write the puchkaman equivalent with:
- imports of `@/components/notifications/*` changed to `@realm/notifications/ui`
- `@/db/schema` imports resolving against puchkaman's barrel
- `@/lib/notifications/*` resolving against the Task 3 binders
- the event list coming from puchkaman's `appEvent` enum

Do **not** restyle. The package UI carries the CRM styling both apps share; puchkaman's yellow+green light theme comes from its own tokens.

- [ ] **Step 2: Copy the template API routes**

Same treatment for `app/api/notifications/templates/route.ts`, `preview/route.ts` and `test/route.ts`. `preview` and `test` call `renderEmailForEvent`/`renderInAppForEvent`, which in the package signature take `db, tables` as the first two arguments:

```ts
import { renderEmailForEvent } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";

const rendered = await renderEmailForEvent(db, notificationTables, event, locale, vars);
```

All three routes must be permission-gated exactly as tiffin-grab's are — read the guard used there (`requirePermission` or `requireStaff`) and apply puchkaman's equivalent from `apps/puchkaman/lib/auth/permissions.ts`.

- [ ] **Step 3: Add the sidebar entry**

Read `apps/puchkaman/components/dashboard/app-sidebar.tsx` and add a Notifications entry alongside the existing non-Clover items, pointing at `/dashboard/notifications`, using the same icon convention as its neighbours (`BellIcon` from `lucide-react`).

- [ ] **Step 4: Verify the pages render**

Run: `pnpm --filter puchkaman dev` and visit `/dashboard/notifications/templates` as an admin.
Expected: the template list renders with puchkaman's nine events, each showing "No template" until one is authored.

- [ ] **Step 5: Author one template end to end**

In the UI, create an `order_placed` email template with subject `Order {{order.publicId}} received` and a short body. Save, then use the Test send button to mail yourself.
Expected: the message arrives, and a row appears on the Emails page.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm turbo typecheck
git add apps/puchkaman/app apps/puchkaman/components
git commit -m "feat(puchkaman): admin notification templates, emails and logs UI"
```

---

## Task 9: Mount the bell

**Files:**
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/layout.tsx`
- Create: `apps/puchkaman/components/dashboard/notification-bell-mount.tsx`

**Interfaces:**
- Consumes: `NotificationBell` from `@realm/notifications/ui` (Plan A Task 11); `makeSubscriber` (Task 6).
- Produces: `NotificationBellMount({ userPublicId }: { userPublicId: string })`.

The layout is a server component and `makeSubscriber` returns a closure, so the wiring needs a thin client component between them.

- [ ] **Step 1: Write the mount component**

`apps/puchkaman/components/dashboard/notification-bell-mount.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { NotificationBell } from "@realm/notifications/ui";
import { makeSubscriber } from "@/components/notifications/realtime";

/**
 * Bridges the server layout to the client bell: the subscriber is a closure
 * over the user's public id, which cannot cross the server/client boundary as
 * a function prop.
 */
export function NotificationBellMount({ userPublicId }: { userPublicId: string }) {
  const subscribe = useMemo(() => makeSubscriber(userPublicId), [userPublicId]);
  return <NotificationBell subscribe={subscribe} />;
}
```

- [ ] **Step 2: Mount it in the dashboard layout**

In `apps/puchkaman/app/(dashboard)/dashboard/layout.tsx`, add the import:

```tsx
import { NotificationBellMount } from "@/components/dashboard/notification-bell-mount";
```

and change the `actions` prop of `CrmShell` from `<ModeToggle />` to:

```tsx
          actions={
            <>
              <NotificationBellMount userPublicId={session.user.id} />
              <ModeToggle />
            </>
          }
```

- [ ] **Step 3: Verify end to end**

With `pnpm --filter puchkaman dev` running and signed in as an admin in one tab, place a public order in another tab. The bell badge should increment without a reload.

If it does not, check in order: (1) `/api/realtime?channel=notify:<your usr_ id>` returns a stream rather than 403, (2) the drainer is running (`pnpm --filter puchkaman exec tsx workers/notify-drainer.ts`), (3) an `in_app` template exists for `order_placed` — with no template the handler skips the row by design and records `skipped: no template`.

- [ ] **Step 4: Verify the two `tsc`-blind traps**

```bash
rg -L --files-without-match '"use client"' apps/puchkaman/components/notifications/*.ts apps/puchkaman/components/dashboard/notification-bell-mount.tsx
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/app apps/puchkaman/components
git commit -m "feat(puchkaman): mount the notification bell in the CRM header"
```

---

## Task 10: SES feedback wiring

**Files:**
- Create: `apps/puchkaman/app/api/webhooks/ses/route.ts`
- Modify: `deployment/email/ses-puchkaman.yaml`
- Test: `apps/puchkaman/app/api/webhooks/ses/route.test.ts`

**Interfaces:**
- Consumes: `suppressEmailRecipient` (Task 3).
- Produces: `processSesEvent(messageJson: string): Promise<void>`; `POST /api/webhooks/ses`.

Puchkaman's configuration set currently has **no event destinations** — verified with `aws sesv2 get-configuration-set-event-destinations --configuration-set-name puchkaman-prod`, which returns `null`. Bounces reach the account-level suppression list but never the database.

**Do not clone `deployment/email/ses-suppression.yaml`.** That template declares its own `AWS::SES::ConfigurationSet` named `tiffin-grab-prod`; a puchkaman copy would try to create `puchkaman-prod` a second time and collide with `ses-puchkaman.yaml`, which already owns it. Add the topic and destination to `ses-puchkaman.yaml` instead.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/app/api/webhooks/ses/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const suppress = vi.fn();
vi.mock("@/lib/notifications/suppression", () => ({
  suppressEmailRecipient: (email: string, reason: string) => suppress(email, reason),
}));

const { processSesEvent } = await import("./route");

beforeEach(() => suppress.mockClear());

describe("processSesEvent", () => {
  it("suppresses every recipient of a permanent bounce", async () => {
    await processSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "a@x.com" }, { emailAddress: "b@x.com" }] },
      }),
    );
    expect(suppress).toHaveBeenCalledTimes(2);
    expect(suppress).toHaveBeenCalledWith("a@x.com", "SES hard bounce");
  });

  it("ignores a transient bounce", async () => {
    await processSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@x.com" }] },
      }),
    );
    expect(suppress).not.toHaveBeenCalled();
  });

  it("suppresses a complaint", async () => {
    await processSesEvent(
      JSON.stringify({ eventType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "c@x.com" }] } }),
    );
    expect(suppress).toHaveBeenCalledWith("c@x.com", "SES complaint");
  });

  it("ignores a delivery event", async () => {
    await processSesEvent(JSON.stringify({ eventType: "Delivery" }));
    expect(suppress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test app/api/webhooks/ses/route.test.ts`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Write the route**

Read `apps/tiffin-grab/app/api/webhooks/ses/route.ts` and write puchkaman's copy, changing only the `suppressEmailRecipient` import path to `@/lib/notifications/suppression`. The SNS signature verification, the `SES_FEEDBACK_TOPIC_ARN` defence-in-depth check and the `SubscriptionConfirmation` auto-confirm must all be carried across unchanged — they are what stops a forged POST suppressing arbitrary addresses.

Confirm `sns-validator` is a dependency:

```bash
rg -n '"sns-validator"' apps/tiffin-grab/package.json
```

Add the same version to `apps/puchkaman/package.json` and run `pnpm install`.

- [ ] **Step 4: Add the SNS topic and event destination**

In `deployment/email/ses-puchkaman.yaml`, add a parameter:

```yaml
  WebhookEndpoint:
    Type: String
    Default: https://puchkaman.ca/api/webhooks/ses
    Description: HTTPS endpoint SNS delivers feedback to. Must be live before deploy (auto-confirm).
```

and these resources, alongside the existing `ConfigurationSet`:

```yaml
  FeedbackTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: puchkaman-ses-feedback

  FeedbackTopicPolicy:
    Type: AWS::SNS::TopicPolicy
    Properties:
      Topics:
        - !Ref FeedbackTopic
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: AllowSesPublish
            Effect: Allow
            Principal:
              Service: ses.amazonaws.com
            Action: sns:Publish
            Resource: !Ref FeedbackTopic
            Condition:
              StringEquals:
                aws:SourceAccount: !Ref AWS::AccountId

  EventDestination:
    Type: AWS::SES::ConfigurationSetEventDestination
    # Topic policy must exist before SES starts publishing.
    DependsOn: FeedbackTopicPolicy
    Properties:
      ConfigurationSetName: !Ref ConfigurationSet
      EventDestination:
        Name: sns-bounce-complaint
        Enabled: true
        MatchingEventTypes:
          - BOUNCE
          - COMPLAINT
        SnsDestination:
          TopicARN: !Ref FeedbackTopic

  # Creating this triggers a SubscriptionConfirmation POST to WebhookEndpoint,
  # which the live route auto-confirms after verifying the SNS signature.
  WebhookSubscription:
    Type: AWS::SNS::Subscription
    Properties:
      TopicArn: !Ref FeedbackTopic
      Protocol: https
      Endpoint: !Ref WebhookEndpoint
```

and an output:

```yaml
  FeedbackTopicArn:
    Description: Put this in the app env as SES_FEEDBACK_TOPIC_ARN (webhook defense-in-depth).
    Value: !Ref FeedbackTopic
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test app/api/webhooks/ses/route.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit (do not deploy the stack yet)**

```bash
git add apps/puchkaman/app/api/webhooks apps/puchkaman/package.json deployment/email/ses-puchkaman.yaml pnpm-lock.yaml
git commit -m "feat(puchkaman): SES bounce and complaint feedback to the database

puchkaman-prod had no event destinations, so bounces reached the account
suppression list and nothing else. The topic goes in ses-puchkaman.yaml
rather than a copy of ses-suppression.yaml, which declares its own
ConfigurationSet and would collide."
```

- [ ] **Step 7: Deploy, webhook first**

The SNS subscription auto-confirms against a **live** endpoint, so the app must be deployed before the stack:

```bash
# 1. Deploy the app (webhook route live)
# 2. Then the stack — needs SES/SNS write, which realm-ses-read does not grant.
aws cloudformation deploy --profile default \
  --template-file deployment/email/ses-puchkaman.yaml \
  --stack-name ses-puchkaman \
  --capabilities CAPABILITY_IAM
# 3. Put the FeedbackTopicArn output into the app env, then redeploy.
aws sesv2 get-configuration-set-event-destinations --profile default \
  --region us-east-1 --configuration-set-name puchkaman-prod
```

Expected from the last command: the `sns-bounce-complaint` destination, `Enabled: true`, matching `BOUNCE` and `COMPLAINT` — not `null`.

---

## Task 11: Final verification

**Files:** none — the gate before Plan C.

- [ ] **Step 1: Full typecheck and test**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS across all packages and apps.

- [ ] **Step 2: Confirm no migration drift**

Run: `pnpm --filter puchkaman exec drizzle-kit generate`
Expected: **no new migration file**.

- [ ] **Step 3: Prove migration equivalence on a scratch database**

```bash
createdb puchkaman_scratch
DATABASE_URL=postgres://localhost:5432/puchkaman_scratch pnpm --filter puchkaman exec drizzle-kit migrate
pg_dump --schema-only postgres://localhost:5432/puchkaman_scratch > /tmp/pk-scratch.sql
pg_dump --schema-only postgres://localhost:5432/puchkaman > /tmp/pk-local.sql
diff /tmp/pk-scratch.sql /tmp/pk-local.sql
dropdb puchkaman_scratch
```

Expected: no differences.

- [ ] **Step 4: End-to-end smoke on a real order**

With the dev server and drainer running, and `order_placed` email + in_app templates authored:

1. Place a public order with your own email.
2. Within ~15s the drainer logs `drained`.
3. The email arrives; a row appears on `/dashboard/notifications/emails`.
4. The staff bell badge increments.
5. `select status, attempts, last_error from notification_outbox order by created_at desc limit 4;` shows `sent`, `attempts=1`, `last_error` null for templated channels.

- [ ] **Step 5: Verify a customer genuinely cannot sign in**

Attempt a password reset / OTP for a provisioned customer address.
Expected: no session is issued. The `assertSessionAllowed` guard rejects `role: "user"` before a session row is written.

- [ ] **Step 6: Commit and tag the milestone**

```bash
git commit --allow-empty -m "chore(puchkaman): plan B complete -- notifications live

Customers exist as users, order events emit into the outbox, the drainer
delivers, staff see an in-app bell, and SES feedback reaches the database.
Plan C adds campaigns on top."
```

---

## Self-Review

**Spec coverage.** This plan covers spec §5.3 (puchkaman `locale`, `phone`, `app_event` enum, the event/recipient/channel table), §6 (customer provisioning, the session guard, the backfill), §3.3 (drainer worker + compose), §3.4 (SSE realtime, no RabbitMQ), and phase-1 items 3, 4, 5, 6, 7 and 8.

Not covered here, by design: §7 consent enforcement beyond the schema columns — there is no marketing send in this plan, so unsubscribe links, consent expiry in audience resolution and the campaign footer belong to **Plan C** with the feature that needs them. Phase-1 item 9 (AppSync cleanup) is in Plan A. Phase 2 and 3 are Plans C and D.

**Placeholder scan.** Tasks 8 and 10 Step 3 instruct porting from a named tiffin-grab file rather than reproducing several hundred lines of page shell and SNS verification inline; both name the exact source path, the exact edits, and what must not change. Task 3 Step 3 likewise says to diff `email-log.ts` against tiffin-grab's before writing it, because the shared admin UI reads those columns by name. Everything else is runnable as written.

**Type consistency.** `notificationTables` and `usersRef` are produced in Task 3 and consumed by Tasks 4, 6 and 10 under those names. `enqueueNotification`/`enqueueStaff` are defined in Task 3 and used in Task 4. `notifyChannel` (Task 3, server) and the `notify:<publicId>` literal in `makeSubscriber` (Task 6, client) must stay in sync — the client cannot import the server module, so Task 6's test pins the format via `parseNotifyChannel`. `makeSubscriber`'s callback takes no argument, which matches Plan A's widened `subscribe?: (onEvent: (n?: RealtimeNotification) => void) => Promise<() => void>` prop.

One known ordering constraint: Task 4's tests need Task 3's migration applied, and Task 5's backfill assumes Task 1's columns exist. Executed in order, this holds.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-12-puchkaman-notifications-adoption.md`.
