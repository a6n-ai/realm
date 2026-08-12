# `@realm/notifications` Package + tiffin-grab Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract tiffin-grab's notification system into a shared, channel-generic, provider-injected `@realm/notifications` package, extended with the columns and tables that campaigns and non-user recipients will need, and refactor tiffin-grab onto it with no behaviour change.

**Architecture:** The package exports a *table factory* rather than tables, because the schema references app-owned things (`users.id` as a FK, a per-app `app_event` enum). Each app calls the factory from its own schema barrel so `drizzle-kit` generates that app's migration — the same pattern `@realm/google-reviews` uses for `review_nudges`. All functions take `db`/`tx` and a `tables` bag as parameters; the package never imports an app. Delivery providers and the realtime `broadcast` are injected, so tiffin-grab keeps its RabbitMQ/AppSync transport while puchkaman (Plan B) injects SSE.

**Tech Stack:** TypeScript, Drizzle ORM (`drizzle-orm/pg-core`), Postgres, Vitest, React 19 / Next 16 for the `ui/` subpath.

## Global Constraints

- Package version/scaffolding matches the existing workspace packages exactly: `"version": "0.0.0"`, `"private": true`, `"type": "module"`, `"exports"` map, `tsconfig.json` extending `../../tsconfig.base.json`, vitest `environment: "node"`.
- Packages ship **raw `.ts`/`.tsx` — no build step**. Client-consumed packages must be listed in each app's `next.config.ts` `transpilePackages`.
- Layering is acyclic: `@realm/notifications` depends only on `@realm/commons` and `@realm/database`. It must **not** import `@realm/email` (the provider interface is defined here and adapted by the app), and must **not** import an app.
- `ui/` may import `@realm/ui` and `@realm/design-system` only.
- TypeScript everywhere. Comment the non-obvious *why* only. `rg`/`fd` over `grep`/`find`.
- Two things `tsc` cannot catch — verify by eye on every moved client component: (1) a stripped or missing `"use client"` directive, (2) a client symbol demoted from a named export (the `Component.Skeleton` trap).
- Audit fields (`created_by`/`updated_by`) are stamped from the session, never from input.
- **Never rewrite an applied migration.** New migrations only.
- Verify gate after every task: `pnpm turbo typecheck` must pass. Full gate at the end: `pnpm turbo typecheck && pnpm turbo test`.
- Drizzle generic for any `db` parameter is `PostgresJsDatabase<any>` with the eslint disable comment used in `packages/google-reviews/src/db.ts` — a concrete schema generic would reject every app's `db`.

---

## File Structure

**Created — `packages/notifications/`**

| File | Responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Scaffold |
| `src/types.ts` | `Channel`, `Kind`, `ChannelProvider`, `OutboundMessage`, `NotificationTables` |
| `src/policy.ts` | Pure: `resolveChannels`, `nextBackoffMs`, `MAX_ATTEMPTS` |
| `src/schema.ts` | `makeNotificationTables()` — the table factory |
| `src/template.ts` | `pickTemplate` (pure), `renderEmailForEvent`, `renderInAppForEvent` |
| `src/suppression.ts` | Address-keyed suppress/lookup |
| `src/enqueue.ts` | `enqueue`, `enqueueToRole` |
| `src/handlers.ts` | `buildHandlers({ db, tables, providers, broadcast })` |
| `src/drain.ts` | `drainOnce`, `drainPending`, token-bucket rate limit |
| `src/feed.ts` | `getFeed`, `markRead` |
| `src/index.ts`, `src/ui/index.ts` | Barrels |
| `src/ui/*.tsx` | Admin + bell components moved from tiffin-grab |

**Modified — `apps/tiffin-grab/`**

| File | Change |
| --- | --- |
| `db/schema/notifications.ts` | Replaced by a factory call |
| `db/schema/notification-template.ts` | Deleted; the factory owns it |
| `db/migrations/` | One new migration for the added columns/tables |
| `lib/notifications/*.ts` | Become thin binders over the package |
| `components/notifications/*.tsx` | Moved into the package; app keeps only its transport |
| `app/(dashboard)/dashboard/notifications/**` | Import package UI |
| `next.config.ts` | Add `@realm/notifications` to `transpilePackages` |
| `package.json` | Add the workspace dependency |

**Deleted:** `apps/tiffin-grab/app/api/notifications/ws-token/route.ts` and the commented `APPSYNC_*` lines in `deployment/prod/tiffin-grab/.env.production.example`.

---

## Task 1: Scaffold the package and move the pure policy module

**Files:**
- Create: `packages/notifications/package.json`
- Create: `packages/notifications/tsconfig.json`
- Create: `packages/notifications/vitest.config.ts`
- Create: `packages/notifications/src/types.ts`
- Create: `packages/notifications/src/policy.ts`
- Test: `packages/notifications/src/policy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Channel = "email" | "in_app" | "sms" | "whatsapp"`; `Kind = "transactional" | "marketing"`; `ChannelProvider.send(msg: OutboundMessage): Promise<{ providerMessageId: string }>`; `resolveChannels(wanted: Channel[], prefs: PrefRow[], opts: ResolveOpts): Channel[]`; `nextBackoffMs(attempts: number): number`; `MAX_ATTEMPTS: number`.

- [ ] **Step 1: Create the scaffold files**

`packages/notifications/package.json`:

```json
{
  "name": "@realm/notifications",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts",
    "./ui": "./src/ui/index.ts"
  },
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@realm/commons": "workspace:*",
    "@realm/database": "workspace:*"
  },
  "peerDependencies": {
    "drizzle-orm": "^0.45.2",
    "next": "16.2.9",
    "react": "^19"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "drizzle-orm": "^0.45.2",
    "next": "16.2.9",
    "postgres": "^3.4.9",
    "react": "19.2.4",
    "typescript": "^5",
    "vitest": "^4.1.9"
  }
}
```

`packages/notifications/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2022", "DOM"], "jsx": "react-jsx" }, "include": ["src"] }
```

`packages/notifications/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 2: Write `src/types.ts`**

```ts
/** Delivery channels. email + in_app ship now; sms/whatsapp are handler-only additions. */
export type Channel = "email" | "in_app" | "sms" | "whatsapp";

/**
 * Consent regime. `transactional` is a receipt the recipient cannot opt out of;
 * `marketing` is a commercial message that requires consent and an unsubscribe.
 * They share a delivery path but never share an opt-out.
 */
export type Kind = "transactional" | "marketing";

/** An already-rendered message. Rendering happens upstream; a provider only transports. */
export interface OutboundMessage {
  to: { email?: string; phone?: string; name?: string };
  /** email only */
  subject?: string;
  html?: string;
  text?: string;
  /** whatsapp / templated sms: the provider-side approved template id */
  providerTemplateId?: string;
  /** merge values for a provider-side template */
  vars?: Record<string, unknown>;
}

export interface ChannelProvider {
  send(msg: OutboundMessage): Promise<{ providerMessageId: string }>;
}
```

- [ ] **Step 3: Write the failing test**

`packages/notifications/src/policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, nextBackoffMs, resolveChannels } from "./policy";

describe("nextBackoffMs", () => {
  it("doubles from one minute and caps at one hour", () => {
    expect(nextBackoffMs(0)).toBe(60_000);
    expect(nextBackoffMs(1)).toBe(120_000);
    expect(nextBackoffMs(2)).toBe(240_000);
    expect(nextBackoffMs(99)).toBe(3_600_000);
  });

  it("has a max-attempts ceiling", () => {
    expect(MAX_ATTEMPTS).toBe(6);
  });
});

describe("resolveChannels", () => {
  it("defaults a channel on when no pref row exists", () => {
    expect(resolveChannels(["in_app"], [], {})).toEqual(["in_app"]);
  });

  it("drops a channel the user disabled for this kind", () => {
    const prefs = [{ channel: "email" as const, kind: "marketing" as const, enabled: false }];
    expect(resolveChannels(["email"], prefs, { kind: "marketing" })).toEqual([]);
  });

  it("keeps transactional email when only marketing email is disabled", () => {
    const prefs = [{ channel: "email" as const, kind: "marketing" as const, enabled: false }];
    expect(resolveChannels(["email"], prefs, { kind: "transactional" })).toEqual(["email"]);
  });

  it("drops a suppressed channel regardless of kind", () => {
    expect(
      resolveChannels(["email", "in_app"], [], { kind: "transactional", suppressed: ["email"] }),
    ).toEqual(["in_app"]);
  });

  it("honours the legacy notifyEmail opt-out when there is no pref row", () => {
    expect(resolveChannels(["email", "in_app"], [], { notifyEmail: false })).toEqual(["in_app"]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test`
Expected: FAIL — `Failed to resolve import "./policy"`.

- [ ] **Step 5: Write `src/policy.ts`**

Note the two deliberate changes from tiffin-grab's version: `PrefRow` gains `kind` (so a marketing opt-out cannot silence a receipt), and `suppressed` leaves `PrefRow` entirely — suppression is now a fact about an *address*, resolved by the caller and passed in.

```ts
import type { Channel, Kind } from "./types";

export const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 3_600_000;

/** Exponential backoff: 1m, 2m, 4m … capped at 1h. */
export function nextBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

export interface PrefRow {
  channel: Channel;
  kind: Kind;
  enabled: boolean;
}

export interface ResolveOpts {
  /** Defaults to "transactional" so a caller that forgets cannot silently mail marketing. */
  kind?: Kind;
  /** Addresses' suppressed channels, resolved from message_suppression by the caller. */
  suppressed?: Channel[];
  /** tiffin-grab's legacy users.notifyEmail opt-in. Absent = allowed. */
  notifyEmail?: boolean;
}

/**
 * Resolve which channels actually get an outbox row.
 * - suppressed channel: never, whatever the prefs say (bounce/complaint/STOP is a fact)
 * - explicit pref row for this (channel, kind): honour `enabled`
 * - no pref row: default-on, EXCEPT email defers to the legacy notifyEmail opt-in
 */
export function resolveChannels(
  wanted: Channel[],
  prefs: PrefRow[],
  opts: ResolveOpts,
): Channel[] {
  const kind = opts.kind ?? "transactional";
  const suppressed = new Set(opts.suppressed ?? []);
  const byKey = new Map(prefs.map((p) => [`${p.channel}:${p.kind}`, p]));

  return wanted.filter((c) => {
    if (suppressed.has(c)) return false;
    const p = byKey.get(`${c}:${kind}`);
    if (p) return p.enabled;
    if (c === "email" && opts.notifyEmail === false) return false;
    return true;
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test`
Expected: PASS — 6 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/notifications
git commit -m "feat(notifications): scaffold package with channel policy

resolveChannels gains a `kind` dimension so a marketing opt-out cannot
silence a transactional receipt, and suppression moves out of PrefRow --
it is a fact about an address, not a user preference."
```

---

## Task 2: Table factory

**Files:**
- Create: `packages/notifications/src/schema.ts`
- Test: `packages/notifications/src/schema.test.ts`

**Interfaces:**
- Consumes: `Channel`, `Kind` from Task 1.
- Produces: `makeNotificationTables(deps: { users: AnyPgTable; appEvent: PgEnum<[string, ...string[]]>; locale: PgEnum<[string, ...string[]]> }): NotificationTables`, where `NotificationTables` has keys `notificationChannel`, `outboxStatus`, `messageKind`, `notifications`, `notificationOutbox`, `notificationPrefs`, `notificationTemplate`, `messageSuppression`. Every later task takes this object as its `tables` parameter.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { bigint, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { makeNotificationTables } from "./schema";

const users = pgTable("users", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const appEvent = pgEnum("app_event", ["order_placed", "order_paid"]);
const locale = pgEnum("locale", ["en", "fr"]);

const t = makeNotificationTables({ users, appEvent, locale });

function columns(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((c) => c.name).sort();
}

describe("makeNotificationTables", () => {
  it("names the tables as the apps expect", () => {
    expect(getTableConfig(t.notifications).name).toBe("notifications");
    expect(getTableConfig(t.notificationOutbox).name).toBe("notification_outbox");
    expect(getTableConfig(t.notificationPrefs).name).toBe("notification_prefs");
    expect(getTableConfig(t.notificationTemplate).name).toBe("notification_template");
    expect(getTableConfig(t.messageSuppression).name).toBe("message_suppression");
  });

  it("gives the outbox a nullable recipient plus literal address columns", () => {
    const cols = getTableConfig(t.notificationOutbox).columns;
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.get("recipient_id")!.notNull).toBe(false);
    expect(columns(t.notificationOutbox)).toEqual(
      expect.arrayContaining(["recipient_email", "recipient_phone", "kind", "campaign_id"]),
    );
  });

  it("makes the outbox event nullable so a campaign row needs no event", () => {
    const event = getTableConfig(t.notificationOutbox).columns.find((c) => c.name === "event")!;
    expect(event.notNull).toBe(false);
  });

  it("keys suppression on the address, not a user", () => {
    expect(columns(t.messageSuppression)).toEqual(
      ["address", "app_id", "channel", "created_at", "created_by", "id", "public_id", "reason"],
    );
  });

  it("carries consent provenance on prefs", () => {
    expect(columns(t.notificationPrefs)).toEqual(
      expect.arrayContaining(["kind", "consent_source", "consent_at"]),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/schema.test.ts`
Expected: FAIL — `Failed to resolve import "./schema"`.

- [ ] **Step 3: Write `src/schema.ts`**

```ts
import { baseColumns, updatableColumns } from "@realm/database";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  type AnyPgTable,
  type PgEnum,
} from "drizzle-orm/pg-core";

/** Delivery channels. email + in_app have handlers; sms/whatsapp are declared for later. */
export const notificationChannel = pgEnum("notification_channel", [
  "email", "in_app", "sms", "whatsapp",
]);

export const outboxStatus = pgEnum("notification_outbox_status", [
  "pending", "processing", "sent", "failed",
]);

/** Consent regime. Drives drain priority, opt-out scope and unsubscribe obligations. */
export const messageKind = pgEnum("message_kind", ["transactional", "marketing"]);

/**
 * Build the notification tables against one app's `users` table and event enum.
 *
 * The tables cannot be shared as values: they FK to `users.id` and use a per-app
 * `app_event` enum (tiffin-grab has 18 subscription events, puchkaman has pickup
 * and delivery ones). Each app calls this from its own schema barrel and
 * re-exports, so drizzle-kit generates that app's migration — the same approach
 * `@realm/google-reviews` uses for `review_nudges`.
 */
export function makeNotificationTables(deps: {
  users: AnyPgTable & { id: never };
  appEvent: PgEnum<[string, ...string[]]>;
  locale: PgEnum<[string, ...string[]]>;
}) {
  const { users, appEvent, locale } = deps;
  // The FK target is resolved lazily so the caller's `users` table type does not
  // have to be threaded through every table definition below.
  const userId = () => (users as unknown as { id: never }).id;

  /** In-app feed — the materialized notification a user sees. */
  const notifications = pgTable("notifications", {
    ...baseColumns("ntf"),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(userId),
    // Null for a campaign notification, which has no business event.
    event: appEvent("event"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Optional deep-link target, e.g. "/orders/ord_123". */
    href: text("href"),
    readAt: bigint("read_at", { mode: "number" }),
  }, (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ]);

  /**
   * Transactional outbox — one row per (recipient, channel) so each delivery
   * retries independently. Written in the SAME txn as the business change.
   *
   * The recipient is EITHER a user id OR a literal address: imported contacts
   * have no user row, and provisioning one for every uploaded CSV line would
   * pollute the users table and the permission model.
   */
  const notificationOutbox = pgTable("notification_outbox", {
    ...updatableColumns("nob"),
    recipientId: bigint("recipient_id", { mode: "bigint" }).references(userId),
    recipientEmail: text("recipient_email"),
    recipientPhone: text("recipient_phone"),
    channel: notificationChannel("channel").notNull(),
    kind: messageKind("kind").notNull().default("transactional"),
    event: appEvent("event"),
    campaignId: bigint("campaign_id", { mode: "bigint" }),
    /** Render data for the template (provider-agnostic). */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Earliest epoch-ms the drainer may (re)try this row — drives backoff. */
    nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    lastError: text("last_error"),
    /** Provider id (e.g. SES MessageId) once sent — bounce/complaint correlation. */
    providerMessageId: text("provider_message_id"),
    /** Optional idempotency guard: same event+channel enqueued once. */
    dedupeKey: text("dedupe_key"),
  }, (t) => [
    // Drain claim: transactional first, then oldest-due. A 4k-recipient campaign
    // must never sit ahead of an order receipt queued a second later.
    index("notification_outbox_due_idx").on(t.kind, t.status, t.nextAttemptAt),
    index("notification_outbox_campaign_idx").on(t.campaignId, t.status),
    uniqueIndex("notification_outbox_dedupe_idx").on(t.dedupeKey),
  ]);

  /**
   * Per-user, per-channel, per-kind preference. `enabled` is the user's opt-in.
   * Suppression is NOT here — see messageSuppression.
   */
  const notificationPrefs = pgTable("notification_prefs", {
    ...updatableColumns("npr"),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(userId),
    channel: notificationChannel("channel").notNull(),
    kind: messageKind("kind").notNull().default("transactional"),
    enabled: boolean("enabled").notNull().default(true),
    /** CASL: implied consent from a purchase expires, so the source and date must be provable. */
    consentSource: text("consent_source"),
    consentAt: bigint("consent_at", { mode: "number" }),
  }, (t) => [
    uniqueIndex("notification_prefs_user_channel_kind_idx").on(t.userId, t.channel, t.kind),
  ]);

  /**
   * Suppression is a fact about an ADDRESS, not a preference of a user: SES
   * reports a bounce for an email, a carrier reports STOP for a number, and an
   * imported contact has no user row to hang either on.
   */
  const messageSuppression = pgTable("message_suppression", {
    ...baseColumns("msp"),
    /** Normalized: lowercased email, or E.164 phone. */
    address: text("address").notNull(),
    channel: notificationChannel("channel").notNull(),
    /** bounce | complaint | unsubscribe | manual */
    reason: text("reason").notNull(),
  }, (t) => [
    uniqueIndex("message_suppression_address_channel_idx").on(t.address, t.channel),
  ]);

  /**
   * Admin-authored templates, keyed by (event, channel, locale) with an `en`
   * fallback. No row → the channel is not delivered for that event.
   */
  const notificationTemplate = pgTable("notification_template", {
    ...updatableColumns("ntp"),
    event: appEvent("event").notNull(),
    channel: notificationChannel("channel").notNull(),
    locale: locale("locale").notNull(),
    subject: text("subject").notNull(),
    // in_app: markdown. email: the editor HTML (reload source for re-editing).
    body: text("body"),
    // email only: exported email-safe HTML + plaintext (pre-interpolation).
    html: text("html"),
    text: text("text"),
    /** WhatsApp / templated SMS: the provider-side pre-approved template id. */
    providerTemplateId: text("provider_template_id"),
    enabled: boolean("enabled").notNull().default(true),
  }, (t) => [
    uniqueIndex("notification_template_key_idx").on(t.event, t.channel, t.locale),
  ]);

  return {
    notificationChannel, outboxStatus, messageKind,
    notifications, notificationOutbox, notificationPrefs,
    notificationTemplate, messageSuppression,
  };
}

export type NotificationTables = ReturnType<typeof makeNotificationTables>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/schema.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/schema.ts packages/notifications/src/schema.test.ts
git commit -m "feat(notifications): table factory parameterised on users and app_event

Tables cannot be shared as values -- they FK to users.id and use a per-app
event enum. Each app calls the factory from its own schema barrel so
drizzle-kit generates that app's migration."
```

---

## Task 3: Address-keyed suppression

**Files:**
- Create: `packages/notifications/src/suppression.ts`
- Test: `packages/notifications/src/suppression.test.ts`

**Interfaces:**
- Consumes: `NotificationTables` (Task 2), `Channel` (Task 1).
- Produces: `normalizeAddress(address: string): string`; `suppress(db, tables, input: { address: string; channel: Channel; reason: string }): Promise<void>`; `suppressedChannelsFor(db, tables, addresses: string[]): Promise<Channel[]>`.

- [ ] **Step 1: Write the failing test**

Only `normalizeAddress` is unit-testable without a database; the query paths are covered by the tiffin-grab integration test in Task 9.

`packages/notifications/src/suppression.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeAddress } from "./suppression";

describe("normalizeAddress", () => {
  it("lowercases and trims an email", () => {
    expect(normalizeAddress("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("strips formatting from a phone number but keeps the plus", () => {
    expect(normalizeAddress("+1 (416) 555-0134")).toBe("+14165550134");
  });

  it("is idempotent", () => {
    expect(normalizeAddress(normalizeAddress("Foo@Bar.com"))).toBe("foo@bar.com");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/suppression.test.ts`
Expected: FAIL — `Failed to resolve import "./suppression"`.

- [ ] **Step 3: Write `src/suppression.ts`**

```ts
import { inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NotificationTables } from "./schema";
import type { Channel } from "./types";

// Schema generic is loose (matches @realm/database's Database type): these
// helpers only use the core query builder, and pinning a concrete schema would
// reject every app `db` — each app has its own schema shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/**
 * One normalizer for both address kinds. An email is lowercased (bounce
 * payloads echo the envelope as sent, which may differ in case from what
 * better-auth stored); a phone keeps a leading `+` and drops formatting.
 */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Record a bounce, complaint, unsubscribe or manual block. Idempotent. */
export async function suppress(
  db: Db,
  tables: NotificationTables,
  input: { address: string; channel: Channel; reason: string },
): Promise<void> {
  await db
    .insert(tables.messageSuppression)
    .values({
      address: normalizeAddress(input.address),
      channel: input.channel,
      reason: input.reason,
    })
    .onConflictDoUpdate({
      target: [tables.messageSuppression.address, tables.messageSuppression.channel],
      set: { reason: input.reason },
    });
}

/** Channels blocked for ANY of the given addresses (a recipient's email + phone). */
export async function suppressedChannelsFor(
  db: Db,
  tables: NotificationTables,
  addresses: string[],
): Promise<Channel[]> {
  const normalized = addresses.filter(Boolean).map(normalizeAddress);
  if (normalized.length === 0) return [];
  const rows = await db
    .select({ channel: tables.messageSuppression.channel })
    .from(tables.messageSuppression)
    .where(inArray(tables.messageSuppression.address, normalized));
  return [...new Set(rows.map((r) => r.channel as Channel))];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/suppression.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/suppression.ts packages/notifications/src/suppression.test.ts
git commit -m "feat(notifications): address-keyed suppression

SES reports a bounce for an address, not a user id, and an imported contact
has no user row. Keying on the address also stops the same email being
suppressed as a user while still being mailed as a list member."
```

---

## Task 4: Template resolution and rendering

**Files:**
- Create: `packages/notifications/src/interpolate.ts`
- Create: `packages/notifications/src/template.ts`
- Test: `packages/notifications/src/template.test.ts`

**Interfaces:**
- Consumes: `NotificationTables` (Task 2).
- Produces: `interpolate(template: string, vars: Record<string, unknown>): string`; `pickTemplate(rows: TemplateRow[], channel: string, locale: string): TemplateRow | null`; `renderEmailForEvent(db, tables, event, locale, vars): Promise<{ subject; html; text } | null>`; `renderInAppForEvent(db, tables, event, locale, vars): Promise<{ title; body } | null>`.

`interpolate` is copied into this package rather than imported, because importing `@realm/email` would invert the layering this package exists to keep clean (see Global Constraints). It is ~15 lines.

- [ ] **Step 1: Read the existing implementation to copy**

Run: `cat packages/email/src/render/interpolate.ts packages/email/src/render/interpolate.test.ts`

Copy the implementation verbatim into `packages/notifications/src/interpolate.ts` and its tests into `packages/notifications/src/interpolate.test.ts`, changing only the import path. Do not "improve" it — tiffin-grab's stored templates depend on its exact escaping and missing-variable behaviour.

- [ ] **Step 2: Write the failing test**

`packages/notifications/src/template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickTemplate } from "./template";

const row = (over: Partial<Parameters<typeof pickTemplate>[0][number]>) => ({
  channel: "email", locale: "en", subject: "s", body: null, html: "<p>h</p>",
  text: "t", providerTemplateId: null, enabled: true, ...over,
});

describe("pickTemplate", () => {
  it("returns null when no row matches the channel", () => {
    expect(pickTemplate([row({ channel: "in_app" })], "email", "en")).toBeNull();
  });

  it("ignores disabled rows", () => {
    expect(pickTemplate([row({ enabled: false })], "email", "en")).toBeNull();
  });

  it("prefers the requested locale", () => {
    const rows = [row({ locale: "en", subject: "english" }), row({ locale: "fr", subject: "french" })];
    expect(pickTemplate(rows, "email", "fr")!.subject).toBe("french");
  });

  it("falls back to en when the requested locale is absent", () => {
    const rows = [row({ locale: "en", subject: "english" })];
    expect(pickTemplate(rows, "email", "fr")!.subject).toBe("english");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/template.test.ts`
Expected: FAIL — `Failed to resolve import "./template"`.

- [ ] **Step 4: Write `src/template.ts`**

```ts
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { interpolate } from "./interpolate";
import type { NotificationTables } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface TemplateRow {
  channel: string;
  locale: string;
  subject: string;
  body: string | null;
  html: string | null;
  text: string | null;
  providerTemplateId: string | null;
  enabled: boolean;
}

/** Pure: pick the enabled row for `channel`, preferring `locale`, else `en`. */
export function pickTemplate(rows: TemplateRow[], channel: string, locale: string): TemplateRow | null {
  const enabled = rows.filter((r) => r.channel === channel && r.enabled);
  return enabled.find((r) => r.locale === locale) ?? enabled.find((r) => r.locale === "en") ?? null;
}

async function loadRows(db: Db, tables: NotificationTables, event: string): Promise<TemplateRow[]> {
  const t = tables.notificationTemplate;
  return db.select({
    channel: t.channel, locale: t.locale, subject: t.subject, body: t.body,
    html: t.html, text: t.text, providerTemplateId: t.providerTemplateId, enabled: t.enabled,
  }).from(t).where(eq(t.event, event as never));
}

/** Resolve + render the email body for an event/locale, or null if no template. */
export async function renderEmailForEvent(
  db: Db, tables: NotificationTables, event: string, locale: string, vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const t = pickTemplate(await loadRows(db, tables, event), "email", locale);
  if (!t || !t.html || !t.text) return null;
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.html, vars),
    text: interpolate(t.text, vars),
  };
}

/** Resolve + render the in-app title/body for an event/locale, or null. */
export async function renderInAppForEvent(
  db: Db, tables: NotificationTables, event: string, locale: string, vars: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> {
  const t = pickTemplate(await loadRows(db, tables, event), "in_app", locale);
  if (!t || !t.body) return null;
  return { title: interpolate(t.subject, vars), body: interpolate(t.body, vars) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @realm/notifications test`
Expected: PASS — policy, schema, suppression, interpolate and template suites all green.

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/interpolate.ts packages/notifications/src/interpolate.test.ts packages/notifications/src/template.ts packages/notifications/src/template.test.ts
git commit -m "feat(notifications): template resolution and rendering

interpolate is copied rather than imported from @realm/email: depending on
it would invert the layering that lets @realm/sms and @realm/whatsapp land
as siblings later."
```

---

## Task 5: Enqueue

**Files:**
- Create: `packages/notifications/src/enqueue.ts`
- Test: covered by the tiffin-grab integration test in Task 9 (this module is all database work; a unit test would only assert the mock).

**Interfaces:**
- Consumes: `resolveChannels`/`PrefRow` (Task 1), `NotificationTables` (Task 2), `suppressedChannelsFor` (Task 3).
- Produces: `enqueue(tx, tables, input: EnqueueInput): Promise<void>`; `enqueueToRole(tx, tables, input: EnqueueToRoleInput): Promise<void>`; `EnqueueInput` with fields `event`, `recipientId?`, `recipientEmail?`, `recipientPhone?`, `title`, `body`, `href?`, `data?`, `channels?`, `kind?`, `campaignId?`, `dedupeKey?`.

- [ ] **Step 1: Write `src/enqueue.ts`**

```ts
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveChannels, type PrefRow } from "./policy";
import type { NotificationTables } from "./schema";
import { suppressedChannelsFor } from "./suppression";
import type { Channel, Kind } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/** Default channels per kind when the caller does not name them explicitly. */
const DEFAULT_CHANNELS: Channel[] = ["in_app"];

export interface EnqueueInput {
  event?: string;
  /** Either a user id, or a literal address for a recipient with no account. */
  recipientId?: bigint;
  recipientEmail?: string;
  recipientPhone?: string;
  /** Shown in the in-app feed and used by the email template. */
  title: string;
  body: string;
  href?: string;
  /** Extra render data for templates. */
  data?: Record<string, unknown>;
  channels?: Channel[];
  kind?: Kind;
  campaignId?: bigint;
  /** Idempotency base; suffixed per channel so the same event enqueues once. */
  dedupeKey?: string;
}

/**
 * The app's users table, narrowed to the columns enqueue reads. Passed in
 * rather than imported so the package stays app-agnostic; `notifyEmail` and
 * `phone` are optional because not every app has them (puchkaman has no
 * notifyEmail column; tiffin-grab has no phone).
 */
export interface UsersRef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: { id: any; email: any; role?: any; status?: any; notifyEmail?: any; phone?: any };
}

/**
 * Write one outbox row per resolved (recipient, channel), inside the caller's
 * transaction so the notification commits atomically with the business change.
 *
 * Channel resolution = requested channels ∩ user prefs for this kind, minus any
 * channel suppressed for the recipient's addresses. Missing pref row =
 * channel allowed (default-on).
 */
export async function enqueue(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  input: EnqueueInput,
): Promise<void> {
  const wanted = input.channels ?? DEFAULT_CHANNELS;
  const kind = input.kind ?? "transactional";

  let prefs: PrefRow[] = [];
  let email = input.recipientEmail;
  let phone = input.recipientPhone;
  let notifyEmail: boolean | undefined;

  if (input.recipientId !== undefined) {
    prefs = (await tx
      .select({
        channel: tables.notificationPrefs.channel,
        kind: tables.notificationPrefs.kind,
        enabled: tables.notificationPrefs.enabled,
      })
      .from(tables.notificationPrefs)
      .where(eq(tables.notificationPrefs.userId, input.recipientId))) as PrefRow[];

    const select: Record<string, unknown> = { email: users.columns.email };
    if (users.columns.notifyEmail) select.notifyEmail = users.columns.notifyEmail;
    if (users.columns.phone) select.phone = users.columns.phone;
    const [user] = await tx
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(select as any)
      .from(users.table)
      .where(eq(users.columns.id, input.recipientId));
    email = email ?? (user?.email as string | undefined);
    phone = phone ?? (user?.phone as string | undefined);
    notifyEmail = user?.notifyEmail as boolean | undefined;
  }

  const suppressed = await suppressedChannelsFor(tx, tables, [email, phone].filter(Boolean) as string[]);
  const allowed = resolveChannels(wanted, prefs, { kind, suppressed, notifyEmail });
  if (allowed.length === 0) return;

  // vars = entity-field snapshot used by templates; title/body feed the generic fallback.
  const payload = { title: input.title, body: input.body, href: input.href ?? null, vars: input.data ?? {} };

  await tx
    .insert(tables.notificationOutbox)
    .values(
      allowed.map((channel) => ({
        recipientId: input.recipientId ?? null,
        recipientEmail: email ?? null,
        recipientPhone: phone ?? null,
        channel,
        kind,
        event: (input.event ?? null) as never,
        campaignId: input.campaignId ?? null,
        payload,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}` : null,
      })),
    )
    .onConflictDoNothing({ target: tables.notificationOutbox.dedupeKey });
}

export interface EnqueueToRoleInput extends Omit<EnqueueInput, "recipientId" | "recipientEmail" | "recipientPhone"> {
  roles: string[];
}

/**
 * Fan an event out to every active user holding one of `roles`.
 *
 * Needed because puchkaman customers are guests who cannot log in: staff-facing
 * events ("a new order arrived") have no single recipient, and an in-app
 * notification addressed to a customer would have nowhere to appear.
 */
export async function enqueueToRole(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  input: EnqueueToRoleInput,
): Promise<void> {
  if (!users.columns.role || !users.columns.status) {
    throw new Error("enqueueToRole requires users.role and users.status columns");
  }
  const staff = await tx
    .select({ id: users.columns.id })
    .from(users.table)
    .where(and(inArray(users.columns.role, input.roles), eq(users.columns.status, "active")));

  for (const s of staff) {
    await enqueue(tx, tables, users, {
      ...input,
      recipientId: s.id as bigint,
      // Per-recipient dedupe suffix: one shared key would let the first staff
      // row win the unique index and silently drop everyone else.
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:u${s.id}` : undefined,
    });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @realm/notifications typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/enqueue.ts
git commit -m "feat(notifications): enqueue with kind, literal-address and role fan-out

enqueueToRole suffixes the dedupe key per recipient -- a shared key would
let the first staff row win the unique index and silently drop the rest."
```

---

## Task 6: Handlers

**Files:**
- Create: `packages/notifications/src/handlers.ts`
- Test: `packages/notifications/src/handlers.test.ts`

**Interfaces:**
- Consumes: `NotificationTables` (Task 2), `renderEmailForEvent`/`renderInAppForEvent` (Task 4), `ChannelProvider` (Task 1), `UsersRef` (Task 5).
- Produces: `ChannelHandler = (row: OutboxRow) => Promise<{ providerMessageId: string } | null>`; `buildHandlers(deps: HandlerDeps): Record<Channel, ChannelHandler | undefined>`; `BroadcastFn`.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/handlers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveRecipientAddress } from "./handlers";

describe("resolveRecipientAddress", () => {
  it("prefers the literal address on the row", async () => {
    const load = vi.fn();
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: "row@x.com", recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "row@x.com", locale: "en" });
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to the user row when no literal address is stored", async () => {
    const load = vi.fn().mockResolvedValue({ email: "user@x.com", phone: null, locale: "fr" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "user@x.com", locale: "fr" });
  });

  it("returns null when neither source has an address", async () => {
    const load = vi.fn().mockResolvedValue({ email: null, phone: null, locale: "en" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toBeNull();
  });

  it("uses the phone column for sms", async () => {
    const got = await resolveRecipientAddress(
      { recipientId: null, recipientEmail: null, recipientPhone: "+14165550134" },
      "sms",
      vi.fn(),
    );
    expect(got).toEqual({ address: "+14165550134", locale: "en" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/handlers.test.ts`
Expected: FAIL — `Failed to resolve import "./handlers"`.

- [ ] **Step 3: Write `src/handlers.ts`**

```ts
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NotificationTables } from "./schema";
import { renderEmailForEvent, renderInAppForEvent } from "./template";
import type { Channel, ChannelProvider } from "./types";
import type { UsersRef } from "./enqueue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OutboxRow = any;

export interface BroadcastInput {
  userId: bigint;
  publicId: string;
  event: string | null;
  title: string;
  body: string;
  href: string | null;
}

/** Realtime push transport, injected: RabbitMQ/AppSync in tiffin-grab, SSE in puchkaman. */
export type BroadcastFn = (input: BroadcastInput) => Promise<void>;

/**
 * Delivers one outbox row. Returns the provider id on send, or `null` to SKIP
 * when no DB template exists for this event/channel — the DB template is the
 * single source of truth, so an absent template means the channel is silently
 * not delivered (the drainer records the skip).
 */
export type ChannelHandler = (row: OutboxRow) => Promise<{ providerMessageId: string } | null>;

type LoadUser = (id: bigint) => Promise<{ email: string | null; phone: string | null; locale: string } | undefined>;

/**
 * Address resolution, factored out so it is testable without a database.
 * The literal column wins over the user row: for an imported contact there is
 * no user row at all, and for a user whose address changed after the row was
 * queued the stored address is the one consent was given for.
 */
export async function resolveRecipientAddress(
  row: { recipientId: bigint | null; recipientEmail: string | null; recipientPhone: string | null },
  channel: Channel,
  loadUser: LoadUser,
): Promise<{ address: string; locale: string } | null> {
  const literal = channel === "email" ? row.recipientEmail : row.recipientPhone;
  if (literal) return { address: literal, locale: "en" };
  if (row.recipientId === null) return null;
  const user = await loadUser(row.recipientId);
  const address = channel === "email" ? user?.email : user?.phone;
  if (!address) return null;
  return { address, locale: user?.locale ?? "en" };
}

export interface HandlerDeps {
  db: Db;
  tables: NotificationTables;
  users: UsersRef;
  providers: Partial<Record<Channel, ChannelProvider>>;
  broadcast: BroadcastFn;
}

function payloadParts(row: OutboxRow) {
  const p = row.payload as { href?: string | null; vars?: Record<string, unknown> };
  return { href: p.href ?? null, vars: p.vars ?? {} };
}

export function buildHandlers(deps: HandlerDeps): Record<Channel, ChannelHandler | undefined> {
  const { db, tables, users, providers, broadcast } = deps;

  const loadUser: LoadUser = async (id) => {
    const select: Record<string, unknown> = { email: users.columns.email };
    if (users.columns.phone) select.phone = users.columns.phone;
    // `locale` is read off the users table by name; both apps have it after Plan B.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select.locale = (users.table as any).locale;
    const [row] = await db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(select as any)
      .from(users.table)
      .where(eq(users.columns.id, id));
    if (!row) return undefined;
    return {
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      locale: (row.locale as string | null) ?? "en",
    };
  };

  /** in_app: render the DB template; no template → skip. Insert feed row + broadcast. */
  const inApp: ChannelHandler = async (row) => {
    if (row.recipientId === null) return null; // no feed without an account
    const { href, vars } = payloadParts(row);
    const user = await loadUser(row.recipientId);
    const rendered = row.event
      ? await renderInAppForEvent(db, tables, row.event, user?.locale ?? "en", vars)
      : { title: row.payload.title as string, body: row.payload.body as string };
    if (!rendered) return null;

    const [n] = await db
      .insert(tables.notifications)
      .values({
        userId: row.recipientId,
        event: row.event,
        title: rendered.title,
        body: rendered.body,
        href,
      })
      .returning({ publicId: tables.notifications.publicId });

    // Publish-after-commit: the feed row is durable above; the live ping is best-effort.
    await broadcast({
      userId: row.recipientId,
      publicId: n.publicId,
      event: row.event,
      title: rendered.title,
      body: rendered.body,
      href,
    });

    return { providerMessageId: n.publicId };
  };

  const viaProvider = (channel: Channel): ChannelHandler | undefined => {
    const provider = providers[channel];
    if (!provider) return undefined;
    return async (row) => {
      const { vars } = payloadParts(row);
      const target = await resolveRecipientAddress(row, channel, loadUser);
      if (!target) return null;

      if (channel === "email") {
        const rendered = row.event
          ? await renderEmailForEvent(db, tables, row.event, target.locale, vars)
          : null;
        if (!rendered) return null; // no DB template → don't send
        return provider.send({
          to: { email: target.address },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      // sms / whatsapp: body text plus an optional provider-side template id.
      const rendered = row.event
        ? await renderInAppForEvent(db, tables, row.event, target.locale, vars)
        : null;
      if (!rendered) return null;
      return provider.send({ to: { phone: target.address }, text: rendered.body, vars });
    };
  };

  return {
    in_app: inApp,
    email: viaProvider("email"),
    sms: viaProvider("sms"),
    whatsapp: viaProvider("whatsapp"),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/handlers.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/handlers.ts packages/notifications/src/handlers.test.ts
git commit -m "feat(notifications): channel handlers with injected providers

Adding sms or whatsapp is now supplying a provider -- no change to the
outbox, the drainer or the admin UI."
```

---

## Task 7: Drainer with priority and rate limiting

**Files:**
- Create: `packages/notifications/src/drain.ts`
- Test: `packages/notifications/src/drain.test.ts`

**Interfaces:**
- Consumes: `MAX_ATTEMPTS`/`nextBackoffMs` (Task 1), `NotificationTables` (Task 2), `ChannelHandler` (Task 6).
- Produces: `createRateLimiter(perSecond: number): RateLimiter`; `drainOnce(deps: DrainDeps, limit?: number): Promise<number>`; `drainPending(deps: DrainDeps, limit?: number, maxBatches?: number): Promise<number>`.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/drain.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./drain";

describe("createRateLimiter", () => {
  it("allows a full bucket to drain without waiting", async () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(10, () => Date.now());
    const started = Date.now();
    for (let i = 0; i < 10; i++) await limiter.take();
    expect(Date.now() - started).toBe(0);
    vi.useRealTimers();
  });

  it("reports the wait needed once the bucket is empty", () => {
    let now = 0;
    const limiter = createRateLimiter(10, () => now);
    for (let i = 0; i < 10; i++) limiter.tryTake();
    expect(limiter.tryTake()).toBe(false);
    now += 100; // one token refills at 10/s
    expect(limiter.tryTake()).toBe(true);
  });

  it("never accumulates more than one second of tokens", () => {
    let now = 0;
    const limiter = createRateLimiter(5, () => now);
    now += 60_000;
    let taken = 0;
    while (limiter.tryTake()) taken++;
    expect(taken).toBe(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/drain.test.ts`
Expected: FAIL — `Failed to resolve import "./drain"`.

- [ ] **Step 3: Write `src/drain.ts`**

```ts
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { MAX_ATTEMPTS, nextBackoffMs } from "./policy";
import type { NotificationTables } from "./schema";
import type { ChannelHandler, OutboxRow } from "./handlers";
import type { Channel } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface RateLimiter {
  /** Consume a token if one is available. Non-blocking. */
  tryTake(): boolean;
  /** Consume a token, waiting for a refill if the bucket is empty. */
  take(): Promise<void>;
}

/**
 * Token bucket capped at one second of capacity.
 *
 * SES throttles above MaxSendRate and throttling damages sender reputation, so
 * the cap matters more than the burst. Capacity is deliberately NOT allowed to
 * accumulate over an idle period: a drainer idle for a minute must not then
 * fire a minute's worth of sends in one batch.
 */
export function createRateLimiter(perSecond: number, now: () => number = Date.now): RateLimiter {
  let tokens = perSecond;
  let last = now();

  const refill = () => {
    const t = now();
    tokens = Math.min(perSecond, tokens + ((t - last) / 1000) * perSecond);
    last = t;
  };

  const tryTake = (): boolean => {
    refill();
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  return {
    tryTake,
    async take() {
      while (!tryTake()) {
        await new Promise((r) => setTimeout(r, Math.ceil(1000 / perSecond)));
      }
    },
  };
}

export interface DrainDeps {
  db: Db;
  tables: NotificationTables;
  handlers: Record<Channel, ChannelHandler | undefined>;
  rateLimiter?: RateLimiter;
}

/**
 * Atomically claim up to `limit` due rows (status=pending, backoff elapsed),
 * flipping them to 'processing'. FOR UPDATE SKIP LOCKED lets concurrent
 * drainers run without grabbing the same rows.
 *
 * Transactional rows are claimed first: a large campaign must never delay an
 * order receipt queued a moment later.
 */
async function claim(db: Db, tables: NotificationTables, limit: number, now: number): Promise<OutboxRow[]> {
  const o = tables.notificationOutbox;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(o)
      .where(and(eq(o.status, "pending"), lte(o.nextAttemptAt, now)))
      .orderBy(sql`${o.kind} = 'transactional' desc`, asc(o.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    await tx
      .update(o)
      .set({ status: "processing" })
      .where(inArray(o.id, rows.map((r) => r.id)));
    return rows;
  });
}

async function process(db: Db, tables: NotificationTables, row: OutboxRow, handler: ChannelHandler | undefined): Promise<void> {
  const o = tables.notificationOutbox;
  const attempts = row.attempts + 1;
  try {
    if (!handler) throw new Error(`No handler for channel ${row.channel}`);
    const result = await handler(row);
    // null = skipped (no DB template for this event/channel). Terminal, no retry.
    await db
      .update(o)
      .set(
        result
          ? { status: "sent", attempts, providerMessageId: result.providerMessageId, lastError: null }
          : { status: "sent", attempts, providerMessageId: null, lastError: "skipped: no template" },
      )
      .where(eq(o.id, row.id));
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    const dead = attempts >= MAX_ATTEMPTS;
    await db
      .update(o)
      .set({
        status: dead ? "failed" : "pending",
        attempts,
        lastError,
        nextAttemptAt: Date.now() + nextBackoffMs(attempts),
      })
      .where(eq(o.id, row.id));
  }
}

/** Claim + deliver one batch. Returns how many rows were processed. */
export async function drainOnce(deps: DrainDeps, limit = 25): Promise<number> {
  const rows = await claim(deps.db, deps.tables, limit, Date.now());
  for (const row of rows) {
    // Serialized on purpose: the rate limiter exists to hold a send ceiling,
    // which Promise.all over the batch would blow straight through.
    if (deps.rateLimiter && row.channel !== "in_app") await deps.rateLimiter.take();
    await process(deps.db, deps.tables, row, deps.handlers[row.channel as Channel]);
  }
  return rows.length;
}

/** Drain until the queue is empty or `maxBatches` is hit. */
export async function drainPending(deps: DrainDeps, limit = 25, maxBatches = 20): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await drainOnce(deps, limit);
    total += n;
    if (n < limit) break;
  }
  return total;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/drain.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/drain.ts packages/notifications/src/drain.test.ts
git commit -m "feat(notifications): drainer with transactional priority and rate limit

Claim orders transactional rows first so a bulk campaign cannot delay an
order receipt, and sends are serialized behind a token bucket -- Promise.all
over the batch would blow straight through the SES send-rate ceiling."
```

---

## Task 8: Feed and package barrel

**Files:**
- Create: `packages/notifications/src/feed.ts`
- Create: `packages/notifications/src/index.ts`

**Interfaces:**
- Consumes: `NotificationTables` (Task 2).
- Produces: `getFeed(db, tables, userId): Promise<{ items: FeedItem[]; unread: number }>`; `markRead(db, tables, userId, publicIds?): Promise<number>`; `FeedItem`. The barrel re-exports every public symbol from Tasks 1–8.

Note the deliberate change from tiffin-grab's `feed.ts`: `currentUserId()` does **not** move into the package. It calls `getSession()` from the app's auth module, which the package must not import. It stays in each app's binder.

- [ ] **Step 1: Write `src/feed.ts`**

```ts
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NotificationTables } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

const FEED_LIMIT = 30;

export interface FeedItem {
  publicId: string;
  event: string | null;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
}

export async function getFeed(
  db: Db, tables: NotificationTables, userId: bigint,
): Promise<{ items: FeedItem[]; unread: number }> {
  const n = tables.notifications;
  const items = await db
    .select({
      publicId: n.publicId, event: n.event, title: n.title, body: n.body,
      href: n.href, readAt: n.readAt, createdAt: n.createdAt,
    })
    .from(n)
    .where(eq(n.userId, userId))
    .orderBy(desc(n.createdAt))
    .limit(FEED_LIMIT);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(n)
    .where(and(eq(n.userId, userId), isNull(n.readAt)));

  return { items: items as FeedItem[], unread: count };
}

/** Mark the given notifications read (or all unread when no ids). Returns count. */
export async function markRead(
  db: Db, tables: NotificationTables, userId: bigint, publicIds?: string[],
): Promise<number> {
  const n = tables.notifications;
  const onlyUnread = and(eq(n.userId, userId), isNull(n.readAt));
  const where =
    publicIds && publicIds.length > 0
      ? and(onlyUnread, sql`${n.publicId} = any(${publicIds})`)
      : onlyUnread;
  const rows = await db.update(n).set({ readAt: Date.now() }).where(where).returning({ id: n.id });
  return rows.length;
}
```

- [ ] **Step 2: Write `src/index.ts`**

```ts
export * from "./types";
export * from "./policy";
export * from "./schema";
export * from "./interpolate";
export * from "./template";
export * from "./suppression";
export * from "./enqueue";
export * from "./handlers";
export * from "./drain";
export * from "./feed";
```

- [ ] **Step 3: Typecheck and run the whole package suite**

Run: `pnpm --filter @realm/notifications typecheck && pnpm --filter @realm/notifications test`
Expected: PASS — typecheck clean, all suites green.

- [ ] **Step 4: Commit**

```bash
git add packages/notifications/src/feed.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): feed queries and package barrel

currentUserId stays in each app: it calls getSession() from the app's auth
module, which the package must not import."
```

---

## Task 9: tiffin-grab schema swap + migration

**Files:**
- Modify: `apps/tiffin-grab/package.json`
- Rewrite: `apps/tiffin-grab/db/schema/notifications.ts`
- Delete: `apps/tiffin-grab/db/schema/notification-template.ts`
- Modify: `apps/tiffin-grab/db/schema/index.ts`
- Create: `apps/tiffin-grab/db/migrations/<generated>.sql` (via drizzle-kit)
- Test: `apps/tiffin-grab/lib/notifications/__tests__/outbox.integration.test.ts`

**Interfaces:**
- Consumes: `makeNotificationTables` (Task 2), `enqueue`/`enqueueToRole` (Task 5), `suppress` (Task 3), `drainPending` (Task 7).
- Produces: the app's `tables` bag, exported from `db/schema/notifications.ts` as `notificationTables`, plus the individual table re-exports (`notifications`, `notificationOutbox`, `notificationPrefs`, `notificationTemplate`, `messageSuppression`) that the rest of the app already imports by name.

- [ ] **Step 1: Add the workspace dependency**

In `apps/tiffin-grab/package.json`, add to `dependencies`:

```json
"@realm/notifications": "workspace:*",
```

Then run: `pnpm install`

- [ ] **Step 2: Rewrite the schema module**

Replace the whole contents of `apps/tiffin-grab/db/schema/notifications.ts` with:

```ts
import { makeNotificationTables } from "@realm/notifications/schema";
import { locale, users } from "./auth";
import { appEvent } from "./wallet";

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

- [ ] **Step 3: Delete the old template module and fix the barrel**

```bash
rm apps/tiffin-grab/db/schema/notification-template.ts
```

In `apps/tiffin-grab/db/schema/index.ts`, delete the line:

```ts
export * from "./notification-template";
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter tiffin-grab exec drizzle-kit generate`

Inspect the generated SQL. It must contain **only**:
- `CREATE TYPE "message_kind"`
- `CREATE TABLE "message_suppression"` + its unique index
- `ALTER TABLE "notification_outbox"` adding `kind`, `campaign_id`, `recipient_email`, `recipient_phone`; dropping the not-null on `recipient_id` and `event`
- `ALTER TABLE "notifications"` dropping the not-null on `event`
- `ALTER TABLE "notification_template"` adding `provider_template_id`
- `ALTER TABLE "notification_prefs"` adding `kind`, `consent_source`, `consent_at`; dropping `suppressed`, `suppressed_reason`; replacing the unique index
- index changes on `notification_outbox_due_idx` and the new `notification_outbox_campaign_idx`

**Anything else means the factory does not reproduce the existing schema — stop and fix `packages/notifications/src/schema.ts` rather than accepting the diff.**

- [ ] **Step 5: Hand-add the data migration**

drizzle-kit will drop `notification_prefs.suppressed` without preserving it. Edit the generated migration to move that data into `message_suppression` **before** the drop, and to backfill `kind`. Insert these statements in the generated file, above the `ALTER TABLE "notification_prefs" DROP COLUMN` lines:

```sql
--> statement-breakpoint
INSERT INTO "message_suppression" ("address", "channel", "reason")
SELECT lower(u."email"), p."channel", COALESCE(p."suppressed_reason", 'migrated')
FROM "notification_prefs" p
JOIN "users" u ON u."id" = p."user_id"
WHERE p."suppressed" = true AND u."email" IS NOT NULL
ON CONFLICT ("address", "channel") DO NOTHING;
--> statement-breakpoint
UPDATE "notification_prefs" SET "kind" = 'transactional' WHERE "kind" IS NULL;
```

This is an edit to a **newly generated, not-yet-applied** migration — permitted. Never edit a migration that has already run.

- [ ] **Step 6: Apply to the local database**

Run: `pnpm --filter tiffin-grab exec drizzle-kit migrate`
Expected: applies cleanly against the local `tiffin` database.

- [ ] **Step 7: Write the integration test**

`apps/tiffin-grab/lib/notifications/__tests__/outbox.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { drainPending, enqueue, suppress } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationOutbox, notificationTables, users } from "@/db/schema";
import { usersRef } from "@/lib/notifications/tables";

const MARK = "outbox-int";
const created: bigint[] = [];

async function makeUser(email: string): Promise<bigint> {
  const [u] = await db
    .insert(users)
    .values({ name: MARK, email, role: "user", status: "active" })
    .returning({ id: users.id });
  created.push(u.id);
  return u.id;
}

afterEach(async () => {
  if (created.length === 0) return;
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, created));
  await db.delete(users).where(inArray(users.id, created));
  created.length = 0;
});

describe("enqueue + drain", () => {
  it("writes one outbox row per allowed channel", async () => {
    const id = await makeUser(`${MARK}-a@example.test`);
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "order_activated",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["email", "in_app"],
      }),
    );
    const rows = await db
      .select({ channel: notificationOutbox.channel, kind: notificationOutbox.kind })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows.map((r) => r.channel).sort()).toEqual(["email", "in_app"]);
    expect(rows.every((r) => r.kind === "transactional")).toBe(true);
  });

  it("skips a channel suppressed for the recipient's address", async () => {
    const email = `${MARK}-b@example.test`;
    const id = await makeUser(email);
    await suppress(db, notificationTables, { address: email, channel: "email", reason: "bounce" });
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "order_activated",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["email", "in_app"],
      }),
    );
    const rows = await db
      .select({ channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows.map((r) => r.channel)).toEqual(["in_app"]);
    await db
      .delete(notificationTables.messageSuppression)
      .where(eq(notificationTables.messageSuppression.address, email));
  });

  it("does not let a marketing opt-out block a transactional send", async () => {
    const id = await makeUser(`${MARK}-c@example.test`);
    await db.insert(notificationTables.notificationPrefs).values({
      userId: id, channel: "email", kind: "marketing", enabled: false,
    });
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "order_activated",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["email"],
        kind: "transactional",
      }),
    );
    const rows = await db
      .select({ channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows).toHaveLength(1);
  });

  it("terminates a row with no template instead of retrying it", async () => {
    const id = await makeUser(`${MARK}-d@example.test`);
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "manual_adjustment",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["in_app"],
      }),
    );
    await drainPending({ db, tables: notificationTables, handlers: (await import("@/lib/notifications/handlers")).buildAppHandlers() });
    const [row] = await db
      .select({ status: notificationOutbox.status, attempts: notificationOutbox.attempts, lastError: notificationOutbox.lastError })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.recipientId, id), eq(notificationOutbox.channel, "in_app")));
    expect(row.status).toBe("sent");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("skipped: no template");
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm --filter tiffin-grab test lib/notifications/__tests__/outbox.integration.test.ts`
Expected: FAIL — `@/lib/notifications/tables` does not exist yet (Task 10 creates it).

- [ ] **Step 9: Commit the schema swap**

```bash
git add apps/tiffin-grab/package.json apps/tiffin-grab/db pnpm-lock.yaml
git commit -m "refactor(tiffin-grab): build notification tables from the shared factory

Same table and column names, so the diff is only the deliberate additions:
kind, campaign_id, literal recipient columns, provider_template_id, consent
provenance, and address-keyed suppression replacing the prefs columns."
```

---

## Task 10: tiffin-grab binders

**Files:**
- Create: `apps/tiffin-grab/lib/notifications/tables.ts`
- Rewrite: `apps/tiffin-grab/lib/notifications/enqueue.ts`
- Rewrite: `apps/tiffin-grab/lib/notifications/handlers.ts`
- Rewrite: `apps/tiffin-grab/lib/notifications/drain.ts`
- Rewrite: `apps/tiffin-grab/lib/notifications/feed.ts`
- Rewrite: `apps/tiffin-grab/lib/notifications/template-service.tsx` → delete
- Rewrite: `apps/tiffin-grab/lib/notifications/suppression.ts`
- Delete: `apps/tiffin-grab/lib/notifications/policy.ts`, `policy.test.ts`
- Modify: `apps/tiffin-grab/app/api/notifications/templates/preview/route.ts`, `test/route.ts` (import path only)

**Interfaces:**
- Consumes: everything from Tasks 1–8, plus `notificationTables` (Task 9).
- Produces: `usersRef: UsersRef`; `buildAppHandlers(): Record<Channel, ChannelHandler | undefined>`; `enqueueNotification(tx, input)`; `drainPending()`; `currentUserId()`; `getFeed(userId)`; `markRead(userId, ids?)`; `suppressEmailRecipient(email, reason)`.

- [ ] **Step 1: Create the tables/users binding**

`apps/tiffin-grab/lib/notifications/tables.ts`:

```ts
import type { UsersRef } from "@realm/notifications";
import { notificationTables, users } from "@/db/schema";

export { notificationTables };

/**
 * The app's users table, narrowed to what the package reads. `notifyEmail` is
 * tiffin-grab-only — puchkaman has no such column and passes it undefined.
 */
export const usersRef: UsersRef = {
  table: users,
  columns: {
    id: users.id,
    email: users.email,
    role: users.role,
    status: users.status,
    notifyEmail: users.notifyEmail,
  },
};
```

- [ ] **Step 2: Rewrite the enqueue binder**

Replace the whole contents of `apps/tiffin-grab/lib/notifications/enqueue.ts` with:

```ts
import { enqueue, type EnqueueInput } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = (typeof notificationTables.notificationOutbox.event.enumValues)[number];
type Channel = (typeof notificationTables.notificationOutbox.channel.enumValues)[number];

/** Default channels per event. Events not listed here fall back to in_app only. */
const EVENT_CHANNELS: Partial<Record<Event, Channel[]>> = {
  order_activated: ["email", "in_app"],
  order_cancelled: ["email", "in_app"],
  menu_released: ["email", "in_app"],
  payment_received: ["email", "in_app"],
  wallet_credited: ["in_app"],
  ticket_reply: ["email", "in_app"],
  inquiry_follow_up: ["in_app"],
};

export type { EnqueueInput };

/** App-side enqueue: applies tiffin-grab's per-event channel defaults. */
export function enqueueNotification(tx: Tx, input: EnqueueInput & { event: Event }): Promise<void> {
  return enqueue(tx, notificationTables, usersRef, {
    ...input,
    channels: input.channels ?? EVENT_CHANNELS[input.event],
  });
}
```

- [ ] **Step 3: Rewrite the handlers binder**

Replace the whole contents of `apps/tiffin-grab/lib/notifications/handlers.ts` with:

```ts
import { buildHandlers, type ChannelProvider } from "@realm/notifications";
import { getEmailProvider } from "@/lib/email/provider";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { broadcast } from "./broadcast";
import { publishPush } from "./rabbit";

/** Adapt @realm/email's EmailProvider to the package's ChannelProvider shape. */
function emailChannelProvider(): ChannelProvider {
  const provider = getEmailProvider();
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

/**
 * Publish-after-commit: hand the realtime push to RabbitMQ; the worker calls
 * broadcast(). If the broker is unavailable, fall back to the inline push so
 * the live ping still fires.
 */
const appBroadcast = async (input: Parameters<typeof broadcast>[0]) => {
  if (!(await publishPush(input))) await broadcast(input);
};

export function buildAppHandlers() {
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: { email: emailChannelProvider() },
    broadcast: appBroadcast,
  });
}
```

- [ ] **Step 4: Rewrite the drain binder**

Replace the whole contents of `apps/tiffin-grab/lib/notifications/drain.ts` with:

```ts
import { createRateLimiter, drainPending as drain } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables } from "./tables";
import { buildAppHandlers } from "./handlers";

// SES MaxSendRate is 14/s on this account; stay under it so a burst cannot
// trigger throttling, which damages sender reputation.
const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 10);

export function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    {
      db,
      tables: notificationTables,
      handlers: buildAppHandlers(),
      rateLimiter: createRateLimiter(SEND_RATE),
    },
    limit,
    maxBatches,
  );
}
```

- [ ] **Step 5: Rewrite the feed binder**

Replace the whole contents of `apps/tiffin-grab/lib/notifications/feed.ts` with:

```ts
import { eq } from "drizzle-orm";
import { getFeed as pkgGetFeed, markRead as pkgMarkRead, type FeedItem } from "@realm/notifications";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { notificationTables } from "./tables";

export type { FeedItem };

/** Resolve the logged-in user's internal bigint id, or null when no session. */
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

- [ ] **Step 6: Rewrite the suppression binder**

Replace the whole contents of `apps/tiffin-grab/lib/notifications/suppression.ts` with:

```ts
import { suppress } from "@realm/notifications";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { notificationTables } from "./tables";

const log = createLogger("ses-suppression");

/**
 * Block the email channel for an address in response to an SES hard bounce or
 * complaint. Keyed on the address rather than a user: the bounce payload has no
 * user id, and an address with no account still must not be retried.
 */
export async function suppressEmailRecipient(email: string, reason: string): Promise<boolean> {
  await suppress(db, notificationTables, { address: email, channel: "email", reason });
  log.info(`suppressed email channel for a bounced/complained address: ${reason}`);
  return true;
}
```

- [ ] **Step 7: Delete the superseded modules and repoint template imports**

```bash
rm apps/tiffin-grab/lib/notifications/policy.ts \
   apps/tiffin-grab/lib/notifications/policy.test.ts \
   apps/tiffin-grab/lib/notifications/template-service.tsx \
   apps/tiffin-grab/lib/notifications/template-service.test.ts
```

In `apps/tiffin-grab/app/api/notifications/templates/preview/route.ts` and `.../test/route.ts`, replace any import of `@/lib/notifications/template-service` with:

```ts
import { renderEmailForEvent, renderInAppForEvent } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";
```

and pass `db, notificationTables` as the first two arguments at each call site.

- [ ] **Step 8: Run the integration test to verify it passes**

Run: `pnpm --filter tiffin-grab test lib/notifications/__tests__/outbox.integration.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 9: Run the full app suite**

Run: `pnpm --filter tiffin-grab test`
Expected: PASS. `handlers.test.ts` and `rabbit.test.ts` still exercise the app-side transport; if `handlers.test.ts` referenced the deleted `__inAppForTest`, repoint it at `buildAppHandlers().in_app`.

- [ ] **Step 10: Commit**

```bash
git add apps/tiffin-grab/lib/notifications apps/tiffin-grab/app/api/notifications
git commit -m "refactor(tiffin-grab): bind notification logic to the shared package

Per-event channel defaults, the SES provider adapter and the Rabbit-then-
inline broadcast stay app-local; everything else now comes from the package."
```

---

## Task 11: Move the admin UI into the package

**Files:**
- Create: `packages/notifications/src/ui/index.ts`
- Move: `apps/tiffin-grab/components/notifications/{email-editor,template-editor,template-list,template-status,template-columns,notifications-nav,notification-bell,use-notifications,format,email-compat}.{ts,tsx}` → `packages/notifications/src/ui/`
- Keep in app: `apps/tiffin-grab/components/notifications/realtime.ts` (the transport stub)
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/notifications/**/*.tsx` (import paths)
- Modify: `apps/tiffin-grab/next.config.ts`
- Modify: `packages/notifications/package.json` (UI dependencies)

**Interfaces:**
- Consumes: nothing from earlier tasks (these are presentational).
- Produces: from `@realm/notifications/ui`: `EmailEditorField`, `EmailEditorFieldHandle`, `TemplateEditor`, `TemplateList`, `TemplateStatus`, `templateColumns`, `NotificationsNav`, `NotificationBell`, `useNotifications`, `formatCode`, `lintEmailHtml`, `CompatWarning`.

The bell needs a realtime transport it must not own. `useNotifications` takes it as a prop so tiffin-grab keeps its stub and puchkaman (Plan B) passes an SSE subscriber.

- [ ] **Step 1: Add the UI dependencies to the package**

In `packages/notifications/package.json`, add to `dependencies`:

```json
"@realm/ui": "workspace:*",
"@react-email/editor": "^0.1.0",
"lucide-react": "^1.20.0",
"prettier": "^3.4.2"
```

Copy the exact version specifiers from `apps/tiffin-grab/package.json` rather than the placeholders above — run `rg '"@react-email/editor"|"prettier"|"lucide-react"' apps/tiffin-grab/package.json` and use what it prints. Then `pnpm install`.

- [ ] **Step 2: Move the files**

```bash
git mv apps/tiffin-grab/components/notifications/email-editor.tsx packages/notifications/src/ui/
git mv apps/tiffin-grab/components/notifications/template-editor.tsx packages/notifications/src/ui/
git mv apps/tiffin-grab/components/notifications/template-list.tsx packages/notifications/src/ui/
git mv apps/tiffin-grab/components/notifications/template-status.tsx packages/notifications/src/ui/
git mv apps/tiffin-grab/components/notifications/template-columns.ts packages/notifications/src/ui/
git mv apps/tiffin-grab/components/notifications/notifications-nav.tsx packages/notifications/src/ui/
git mv apps/tiffin-grab/components/notifications/notification-bell.tsx packages/notifications/src/ui/
git mv apps/tiffin-grab/components/notifications/use-notifications.ts packages/notifications/src/ui/
git mv apps/tiffin-grab/lib/notifications/format.ts packages/notifications/src/ui/format.ts
git mv apps/tiffin-grab/lib/notifications/email-compat.ts packages/notifications/src/ui/email-compat.ts
```

- [ ] **Step 3: Fix the moved files' imports and inject the transport**

In every moved file, rewrite `@/`-prefixed imports. `@realm/ui/*` imports are unchanged.

In `use-notifications.ts`, replace the module-level import of `./realtime` and the `apiFetch` import with injected parameters:

```ts
export interface RealtimeNotification {
  publicId: string;
  event: string | null;
  title: string;
  body: string;
  href: string | null;
}

export interface UseNotificationsOptions {
  /**
   * Realtime transport. Returns an unsubscribe function.
   *
   * The callback takes an OPTIONAL notification: a transport that carries the
   * payload (tiffin-grab's AppSync) passes it and the hook prepends it, while a
   * ping-only transport (@realm/realtime's `{ type: "message" }` frame carries
   * no payload) calls it with nothing and the hook refetches the feed.
   */
  subscribe?: (onEvent: (n?: RealtimeNotification) => void) => Promise<() => void>;
  /** Feed endpoint. Defaults to the convention both apps use. */
  endpoint?: string;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const endpoint = options.endpoint ?? "/api/notifications";
  // …existing body, with `subscribeNotifications` replaced by `options.subscribe`
  // (skip the live-push effect entirely when it is undefined), and the
  // markAllRead POST using plain fetch against `endpoint`. In the live-push
  // effect, the handler becomes:
  //   const onEvent = (n?: RealtimeNotification) => { if (n) prepend(n); else void refresh(); };
}
```

Update `notification-bell.tsx` to accept and forward the same options:

```ts
export function NotificationBell(props: UseNotificationsOptions = {}) {
  const { items, unread, markAllRead } = useNotifications(props);
  // …unchanged JSX
}
```

**Verify by eye:** every moved `.tsx` that had `"use client"` still has it as the first line, and every component is still a *named* export (`export function X`), not a default or a property of another object.

- [ ] **Step 4: Write the UI barrel**

`packages/notifications/src/ui/index.ts`:

```ts
export * from "./email-editor";
export * from "./template-editor";
export * from "./template-list";
export * from "./template-status";
export * from "./template-columns";
export * from "./notifications-nav";
export * from "./notification-bell";
export * from "./use-notifications";
export * from "./format";
export * from "./email-compat";
```

- [ ] **Step 5: Repoint the app**

In `apps/tiffin-grab/next.config.ts`, add `"@realm/notifications"` to the `transpilePackages` array.

In every file under `apps/tiffin-grab/app/(dashboard)/dashboard/notifications/` and wherever `NotificationBell` is mounted, change imports from `@/components/notifications/...` to `@realm/notifications/ui`. At the bell's mount site, pass the app's transport:

```tsx
import { NotificationBell } from "@realm/notifications/ui";
import { subscribeNotifications } from "@/components/notifications/realtime";

<NotificationBell subscribe={subscribeNotifications} />
```

Find every remaining reference:

```bash
rg -n "components/notifications" apps/tiffin-grab
```

Expected after the edits: only `realtime.ts` itself and its importer.

- [ ] **Step 6: Typecheck and test**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A packages/notifications apps/tiffin-grab pnpm-lock.yaml
git commit -m "refactor(notifications): move the admin UI and bell into the package

useNotifications takes its realtime transport as a prop so tiffin-grab keeps
its stub and puchkaman can pass an SSE subscriber without forking the UI."
```

---

## Task 12: Delete the dead AppSync artifacts

**Files:**
- Delete: `apps/tiffin-grab/app/api/notifications/ws-token/route.ts`
- Modify: `deployment/prod/tiffin-grab/.env.production.example`

`broadcast()` is deliberately **retained** — it is tiffin-grab's injected transport, and replacing its AppSync body with SSE is what unlocks the RabbitMQ removal deferred in the spec. Removing it here would change nothing observable while making that later change harder to reason about.

- [ ] **Step 1: Confirm nothing references the route**

Run: `rg -n "ws-token|APPSYNC_AUTH_SECRET" apps/tiffin-grab deployment`
Expected: only the route file itself and the env example.

- [ ] **Step 2: Delete**

```bash
rm apps/tiffin-grab/app/api/notifications/ws-token/route.ts
```

In `deployment/prod/tiffin-grab/.env.production.example`, delete the two commented lines:

```
# APPSYNC_GRAPHQL_URL=
# APPSYNC_API_KEY=
```

and add, near the other notification settings:

```
# Outbox drainer: shared secret for the manual POST /api/notifications/drain kick.
DRAIN_SECRET=change-me
# Sends per second; keep below the SES account MaxSendRate (14/s).
NOTIFY_SEND_RATE=10
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A apps/tiffin-grab deployment
git commit -m "chore(tiffin-grab): drop the dead AppSync ws-token route

The Amplify backend went away with the move to EC2; the route has returned
503 ever since. broadcast() stays -- it is the injected transport, and
swapping its body for SSE is what retires the Rabbit path."
```

---

## Task 13: Final verification

**Files:** none — this is the gate before Plan B.

- [ ] **Step 1: Full typecheck and test**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS across all packages and apps.

- [ ] **Step 2: Confirm no further migration drift**

Run: `pnpm --filter tiffin-grab exec drizzle-kit generate`
Expected: **no new migration file** — the schema and the migrations agree. If a file is produced, the factory still differs from what was migrated; fix the factory, delete the spurious file, and re-run.

- [ ] **Step 3: Prove migration equivalence on a scratch database**

```bash
createdb tiffin_scratch
DATABASE_URL=postgres://localhost:5432/tiffin_scratch pnpm --filter tiffin-grab exec drizzle-kit migrate
pg_dump --schema-only postgres://localhost:5432/tiffin_scratch > /tmp/scratch.sql
pg_dump --schema-only postgres://localhost:5432/tiffin > /tmp/local.sql
diff /tmp/scratch.sql /tmp/local.sql
```

Expected: no differences. A mismatch means the hand-edited data migration in Task 9 Step 5 left the two paths divergent.

```bash
dropdb tiffin_scratch
```

- [ ] **Step 4: Eyeball the two `tsc`-blind traps**

```bash
rg -L --files-without-match '"use client"' packages/notifications/src/ui/*.tsx
```

Expected: no output — every `.tsx` in `ui/` is a client component. Then confirm each is a named export:

```bash
rg -n "^export default" packages/notifications/src/ui/
```

Expected: no output.

- [ ] **Step 5: Commit any fixes and tag the milestone**

```bash
git commit --allow-empty -m "chore(notifications): plan A complete -- shared package extracted

tiffin-grab behaviour unchanged; the outbox now carries the columns campaigns
and non-user recipients need. Plan B wires puchkaman onto it."
```

---

## Self-Review

**Spec coverage.** This plan covers spec §4 (package layout, factory, provider interface), §5.1–5.2 (schema changes and `message_suppression`), §3.2–3.3 (queue rationale, rate limiting, drain priority), §8 phase-1 items 1, 2 and 9, and §10 verification gates 1, 2 and 3.

Deferred to **Plan B** (puchkaman adoption): §5.3, §6, §7, phase-1 items 3–8. Deferred to **Plan C** (campaigns): §5.2 `campaign`/`campaign_content`/`contact_list*`, `unsubscribe.ts`, `audience.ts`, phase 2. Deferred to **Plan D**: phase 3. The `campaign` table is not created here, so `notification_outbox.campaign_id` intentionally carries **no** foreign key until Plan C adds one.

**Placeholder scan.** One deliberate lookup rather than a literal: Task 11 Step 1 instructs running `rg` for the exact dependency version specifiers instead of hardcoding versions that would drift from the app's `package.json`. Every other step contains runnable content.

**Type consistency.** `NotificationTables` (Task 2) is the parameter name `tables` throughout Tasks 3–8. `UsersRef` is defined in Task 5 and consumed by Tasks 6 and 10. `ChannelHandler`/`OutboxRow` are defined in Task 6 and consumed by Task 7. `drainPending` is the package export in Task 7 and is re-exported under the same name by the app binder in Task 10 Step 4 — the binder aliases the import as `drain` to avoid shadowing, which is the one place the names differ, and it is explicit in the code.

One known rough edge: `resolveRecipientAddress` returns `locale: "en"` for a literal address, because an imported contact has no stored locale. Plan C revisits this when `contact_list_member` gains a locale column.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-12-realm-notifications-package.md`.
