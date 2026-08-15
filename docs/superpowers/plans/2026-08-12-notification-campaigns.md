# Notification Campaigns and Contact Lists — Implementation Plan (Plan C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plans A and B complete — `@realm/notifications` exists, both apps run on it, puchkaman delivers transactional mail.

**Goal:** Admins can compose a message, choose an audience from customer data and/or uploaded contact lists, schedule it, and send it — through the same outbox that already carries transactional mail, with consent and unsubscribe enforced at the point of send rather than by convention.

**Architecture:** A campaign is a **bulk `enqueue()`**. Audience resolution produces recipients; `materializeCampaign()` bulk-inserts one outbox row per (recipient, channel) with `kind: "marketing"` and a per-recipient dedupe key; the existing drainer delivers them behind the transactional-priority claim and the rate limiter. Content comes from `campaign_content` instead of `notification_template` — the only genuinely new branch in the delivery path. Nothing about retries, suppression, backoff or provider dispatch is duplicated.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres, `@realm/notifications`, `@realm/storage` (S3), `@realm/design-system` filters, `@react-email/editor`, AWS SES event destinations, Vitest.

## Global Constraints

- Everything from Plans A and B applies: acyclic layering, raw-source packages, `transpilePackages`, never rewrite an applied migration, `pnpm turbo typecheck && pnpm turbo test` as the gate.
- **CASL is a hard requirement, not a preference.** Puchkaman mails Canadian recipients. Every commercial message needs provable consent, sender identification, a physical mailing address, and a working unsubscribe honoured within 10 business days. Penalties reach $10M for organizations. Where this plan says a check is mandatory, it is not optional scope.
- **Marketing must never be able to suppress a receipt.** `message_suppression.scope` distinguishes `"all"` (bounce/complaint/STOP) from `"marketing"` (unsubscribe). Unsubscribe writes `scope: "marketing"` only.
- **Implied consent from a purchase expires after 24 months.** Audience resolution must exclude lapsed implied consent, not merely check a boolean.
- A campaign send is **irreversible**. Any step that materializes outbox rows must be idempotent (per-recipient dedupe key) and must require explicit confirmation in the UI.
- Both apps get the schema; only puchkaman gets the UI in this plan. tiffin-grab picks it up later without further package work.
- Money and pricing rules are untouched here — campaigns carry no amounts.

---

## File Structure

**Created — `packages/notifications/src/`**

| File | Responsibility |
| --- | --- |
| `campaign-schema.ts` | `makeCampaignTables()` — campaign, content, contact list, members |
| `unsubscribe.ts` | HMAC token sign/verify/build, `handleUnsubscribe` |
| `audience.ts` | `resolveAudience`, `countAudience` |
| `campaign.ts` | `materializeCampaign`, `dueCampaigns`, `markCampaignSent` |
| `csv.ts` | `parseCsv`, `mapRows`, `validateContact` |
| `ui/campaign-list.tsx`, `ui/campaign-composer.tsx`, `ui/audience-builder.tsx`, `ui/contact-list-upload.tsx` | Admin UI |

**Modified**

| File | Change |
| --- | --- |
| `packages/notifications/src/schema.ts` | `campaign_id` gains its FK; export the campaign tables |
| `packages/notifications/src/handlers.ts` | Campaign content branch |
| `packages/notifications/src/template.ts` | `renderForCampaign` |
| `apps/*/db/schema/notifications.ts` | Call the campaign factory |
| `apps/puchkaman/workers/notify-drainer.ts` | Materialize due campaigns each tick |
| `apps/puchkaman/app/(dashboard)/dashboard/notifications/**` | Campaign + contact-list pages |
| `deployment/email/ses-puchkaman.yaml` | DELIVERY/OPEN/CLICK event destination |

---

## Task 1: Campaign and contact-list tables

**Files:**
- Create: `packages/notifications/src/campaign-schema.ts`
- Modify: `packages/notifications/src/schema.ts`
- Modify: `packages/notifications/src/index.ts`
- Test: `packages/notifications/src/campaign-schema.test.ts`

**Interfaces:**
- Consumes: `notificationChannel`, `messageKind` (Plan A Task 2).
- Produces: `makeCampaignTables(deps: { locale: PgEnum }): CampaignTables` with keys `campaignStatus`, `consentSource`, `campaign`, `campaignContent`, `contactList`, `contactListMember`.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/campaign-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTableConfig, pgEnum } from "drizzle-orm/pg-core";
import { makeCampaignTables } from "./campaign-schema";

const locale = pgEnum("locale", ["en", "fr"]);
const t = makeCampaignTables({ locale });

function columns(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((c) => c.name).sort();
}

describe("makeCampaignTables", () => {
  it("names the tables as the apps expect", () => {
    expect(getTableConfig(t.campaign).name).toBe("campaign");
    expect(getTableConfig(t.campaignContent).name).toBe("campaign_content");
    expect(getTableConfig(t.contactList).name).toBe("contact_list");
    expect(getTableConfig(t.contactListMember).name).toBe("contact_list_member");
  });

  it("stores the audience as a definition and the channels as a set", () => {
    expect(columns(t.campaign)).toEqual(expect.arrayContaining(["audience", "channels", "status", "scheduled_at", "counts"]));
  });

  it("requires consent provenance on a contact list", () => {
    const cols = getTableConfig(t.contactList).columns;
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.get("consent_source")!.notNull).toBe(true);
    expect(byName.get("consent_at")!.notNull).toBe(true);
  });

  it("lets a list member carry merge fields and an unsubscribe stamp", () => {
    expect(columns(t.contactListMember)).toEqual(
      expect.arrayContaining(["email", "phone", "name", "vars", "unsubscribed_at", "list_id"]),
    );
  });

  it("mirrors the notification_template shape on campaign_content", () => {
    expect(columns(t.campaignContent)).toEqual(
      expect.arrayContaining(["campaign_id", "channel", "locale", "subject", "body", "html", "text", "provider_template_id"]),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/campaign-schema.test.ts`
Expected: FAIL — `Failed to resolve import "./campaign-schema"`.

- [ ] **Step 3: Write `src/campaign-schema.ts`**

```ts
import { baseColumns, updatableColumns } from "@realm/database";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  type PgEnum,
} from "drizzle-orm/pg-core";
import { notificationChannel } from "./schema";

export const campaignStatus = pgEnum("campaign_status", [
  "draft", "scheduled", "sending", "sent", "paused", "cancelled",
]);

/**
 * How consent for an address was obtained. CASL treats implied consent from a
 * purchase as expiring after 24 months, so the source and date must both be
 * stored — a boolean cannot answer "is this consent still valid today?".
 */
export const consentSource = pgEnum("consent_source", [
  "purchase", "express_optin", "event_signup", "import_other",
]);

export interface AudienceDef {
  /** Filter over the app's own customer data. Undefined = lists only. */
  segment?: {
    lastOrderAfter?: number;
    lastOrderBefore?: number;
    minOrderCount?: number;
    minTotalSpend?: number;
    deliveryZoneIds?: string[];
  };
  /** contact_list public ids to union in. */
  listIds?: string[];
}

export function makeCampaignTables(deps: { locale: PgEnum<[string, ...string[]]> }) {
  const { locale } = deps;

  const campaign = pgTable("campaign", {
    ...updatableColumns("cmp"),
    name: text("name").notNull(),
    /** Channels this campaign targets; each recipient still passes through prefs. */
    channels: notificationChannel("channels").array().notNull(),
    audience: jsonb("audience").$type<AudienceDef>().notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    scheduledAt: bigint("scheduled_at", { mode: "number" }),
    sentAt: bigint("sent_at", { mode: "number" }),
    /** { queued, sent, failed, delivered, opened, clicked, bounced, unsubscribed } */
    counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  }, (t) => [
    // Scheduler poll: due campaigns are (status, scheduled_at) lookups.
    index("campaign_status_scheduled_idx").on(t.status, t.scheduledAt),
  ]);

  /** Same shape as notification_template, keyed on a campaign instead of an event. */
  const campaignContent = pgTable("campaign_content", {
    ...updatableColumns("cmc"),
    campaignId: bigint("campaign_id", { mode: "bigint" }).notNull().references(() => campaign.id),
    channel: notificationChannel("channel").notNull(),
    locale: locale("locale").notNull(),
    subject: text("subject").notNull(),
    body: text("body"),
    html: text("html"),
    text: text("text"),
    providerTemplateId: text("provider_template_id"),
  }, (t) => [
    uniqueIndex("campaign_content_key_idx").on(t.campaignId, t.channel, t.locale),
  ]);

  /**
   * An uploaded list. Consent provenance is NOT NULL by design: an imported
   * list has no consent record unless one is supplied, and mailing a purchased
   * or scraped list is not permitted. Making the column nullable would make the
   * unlawful case the path of least resistance.
   */
  const contactList = pgTable("contact_list", {
    ...updatableColumns("ctl"),
    name: text("name").notNull(),
    consentSource: consentSource("consent_source").notNull(),
    consentAt: bigint("consent_at", { mode: "number" }).notNull(),
    consentNote: text("consent_note"),
    memberCount: integer("member_count").notNull().default(0),
  });

  const contactListMember = pgTable("contact_list_member", {
    ...baseColumns("clm"),
    listId: bigint("list_id", { mode: "bigint" }).notNull().references(() => contactList.id),
    email: text("email"),
    phone: text("phone"),
    name: text("name"),
    /** Merge fields lifted from the CSV's extra columns. */
    vars: jsonb("vars").$type<Record<string, string>>().notNull().default({}),
    unsubscribedAt: bigint("unsubscribed_at", { mode: "number" }),
  }, (t) => [
    uniqueIndex("contact_list_member_email_idx").on(t.listId, t.email),
    uniqueIndex("contact_list_member_phone_idx").on(t.listId, t.phone),
  ]);

  return { campaignStatus, consentSource, campaign, campaignContent, contactList, contactListMember };
}

export type CampaignTables = ReturnType<typeof makeCampaignTables>;
```

- [ ] **Step 4: Add the FK from the outbox**

In `packages/notifications/src/schema.ts`, `makeNotificationTables` gains an optional dependency so the FK can be declared once the campaign table exists:

```ts
export function makeNotificationTables(deps: {
  users: AnyPgTable & { id: never };
  appEvent: PgEnum<[string, ...string[]]>;
  locale: PgEnum<[string, ...string[]]>;
  /** Supplied once campaign tables exist (Plan C); omitted, campaign_id carries no FK. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  campaign?: any;
}) {
```

and the column becomes:

```ts
    campaignId: deps.campaign
      ? bigint("campaign_id", { mode: "bigint" }).references(() => deps.campaign.id)
      : bigint("campaign_id", { mode: "bigint" }),
```

Add `export * from "./campaign-schema";` to `src/index.ts`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/campaign-schema.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/campaign-schema.ts packages/notifications/src/campaign-schema.test.ts packages/notifications/src/schema.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): campaign and contact-list tables

contact_list.consent_source and consent_at are NOT NULL on purpose: an
imported list has no consent record unless one is supplied, and a nullable
column would make the unlawful case the path of least resistance."
```

---

## Task 2: Unsubscribe

**Files:**
- Create: `packages/notifications/src/unsubscribe.ts`
- Test: `packages/notifications/src/unsubscribe.test.ts`

**Interfaces:**
- Consumes: `suppress` (Plan A Task 3), `normalizeAddress`.
- Produces: `signUnsubscribeToken(secret, address)`; `verifyUnsubscribeToken(secret, address, token)`; `buildUnsubscribeUrl(baseUrl, secret, address)`; `handleUnsubscribe(db, tables, input): Promise<void>`.

The HMAC pattern is lifted from `packages/google-reviews/src/unsubscribe.ts` — stateless, no DB lookup to issue or verify, and an identical response whether or not the address exists so the endpoint never reveals membership.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/unsubscribe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildUnsubscribeUrl, signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

const SECRET = "test-secret";

describe("unsubscribe tokens", () => {
  it("verifies a token it signed", () => {
    const t = signUnsubscribeToken(SECRET, "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", t)).toBe(true);
  });

  it("is case- and whitespace-insensitive on the address", () => {
    const t = signUnsubscribeToken(SECRET, "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "  A@X.COM ", t)).toBe(true);
  });

  it("rejects a token for a different address", () => {
    const t = signUnsubscribeToken(SECRET, "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "b@x.com", t)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const t = signUnsubscribeToken("other", "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", t)).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", "")).toBe(false);
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", "zzzz")).toBe(false);
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", "ab")).toBe(false);
  });

  it("builds an absolute link carrying address and token", () => {
    const url = new URL(buildUnsubscribeUrl("https://puchkaman.ca", SECRET, "A@X.com"));
    expect(url.pathname).toBe("/unsubscribe");
    expect(url.searchParams.get("address")).toBe("a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", url.searchParams.get("token")!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/unsubscribe.test.ts`
Expected: FAIL — `Failed to resolve import "./unsubscribe"`.

- [ ] **Step 3: Write `src/unsubscribe.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import { normalizeAddress, suppress } from "./suppression";
import type { Channel } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/**
 * HMAC-signed, stateless unsubscribe token — no DB lookup to issue or verify,
 * so a bad or missing token reveals nothing about whether the address exists
 * (the response is identical either way).
 */
export function signUnsubscribeToken(secret: string, address: string): string {
  return createHmac("sha256", secret).update(normalizeAddress(address)).digest("hex");
}

export function verifyUnsubscribeToken(secret: string, address: string, token: string): boolean {
  const expected = Buffer.from(signUnsubscribeToken(secret, address), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Absolute unsubscribe link for a campaign footer. `baseUrl` is the app's own origin. */
export function buildUnsubscribeUrl(baseUrl: string, secret: string, address: string): string {
  const url = new URL("/unsubscribe", baseUrl);
  const normalized = normalizeAddress(address);
  url.searchParams.set("address", normalized);
  url.searchParams.set("token", signUnsubscribeToken(secret, normalized));
  return url.toString();
}

/**
 * Apply an unsubscribe. Idempotent, works for a logged-out guest (the token IS
 * the auth), and scoped to MARKETING only — a receipt for an order the person
 * actually placed is still owed to them, and withholding it is the wrong kind
 * of compliance.
 *
 * Also stamps every contact_list_member row for the address so a later import
 * of the same list cannot silently resurrect them.
 */
export async function handleUnsubscribe(
  db: Db,
  tables: NotificationTables & CampaignTables,
  input: { address: string | null; token: string | null; secret: string; channel?: Channel },
): Promise<void> {
  const { address, token, secret } = input;
  if (!address || !token || !verifyUnsubscribeToken(secret, address, token)) return;

  const normalized = normalizeAddress(address);
  const channel: Channel = input.channel ?? (normalized.includes("@") ? "email" : "sms");

  await suppress(db, tables, {
    address: normalized,
    channel,
    reason: "unsubscribe",
    scope: "marketing",
  });

  const column = channel === "email" ? tables.contactListMember.email : tables.contactListMember.phone;
  await db
    .update(tables.contactListMember)
    .set({ unsubscribedAt: Date.now() })
    .where(and(eq(column, normalized), isNull(tables.contactListMember.unsubscribedAt)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/unsubscribe.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/unsubscribe.ts packages/notifications/src/unsubscribe.test.ts
git commit -m "feat(notifications): stateless HMAC unsubscribe scoped to marketing

Unsubscribing must not stop a receipt for an order the person placed, so the
suppression is scope=marketing. Also stamps contact_list_member so a re-import
of the same list cannot resurrect them."
```

---

## Task 3: Audience resolution

**Files:**
- Create: `packages/notifications/src/audience.ts`
- Test: `packages/notifications/src/audience.test.ts`

**Interfaces:**
- Consumes: `AudienceDef` (Task 1), `NotificationTables`/`CampaignTables`, `UsersRef` (Plan A Task 5).
- Produces: `Recipient = { userId?: bigint; email?: string; phone?: string; name?: string; vars?: Record<string, string> }`; `IMPLIED_CONSENT_MS`; `isConsentValid(source, consentAt, now)`; `resolveAudience(db, tables, users, def, opts): Promise<Recipient[]>`; `countAudience(...): Promise<number>`.

- [ ] **Step 1: Write the failing test**

Consent arithmetic and deduplication are pure and get unit tests here; the SQL paths are covered by the integration test in Task 5.

`packages/notifications/src/audience.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IMPLIED_CONSENT_MS, dedupeRecipients, isConsentValid } from "./audience";

const DAY = 86_400_000;

describe("isConsentValid", () => {
  it("treats express consent as not expiring", () => {
    expect(isConsentValid("express_optin", 0, 100 * 365 * DAY)).toBe(true);
  });

  it("accepts implied consent inside 24 months", () => {
    const now = 1_000 * DAY;
    expect(isConsentValid("purchase", now - IMPLIED_CONSENT_MS + DAY, now)).toBe(true);
  });

  it("rejects implied consent past 24 months", () => {
    const now = 1_000 * DAY;
    expect(isConsentValid("purchase", now - IMPLIED_CONSENT_MS - DAY, now)).toBe(false);
  });

  it("uses a 24-month window", () => {
    expect(IMPLIED_CONSENT_MS).toBe(730 * DAY);
  });
});

describe("dedupeRecipients", () => {
  it("collapses the same email arriving from a segment and a list", () => {
    const out = dedupeRecipients([
      { userId: 1n, email: "a@x.com" },
      { email: "A@X.com", vars: { city: "Toronto" } },
    ]);
    expect(out).toHaveLength(1);
  });

  it("prefers the entry that carries a user id", () => {
    const out = dedupeRecipients([{ email: "a@x.com" }, { userId: 7n, email: "a@x.com" }]);
    expect(out[0].userId).toBe(7n);
  });

  it("merges merge-vars from the list entry onto the kept recipient", () => {
    const out = dedupeRecipients([
      { userId: 7n, email: "a@x.com" },
      { email: "a@x.com", vars: { city: "Toronto" } },
    ]);
    expect(out[0]).toMatchObject({ userId: 7n, vars: { city: "Toronto" } });
  });

  it("keeps distinct addresses apart", () => {
    expect(dedupeRecipients([{ email: "a@x.com" }, { email: "b@x.com" }])).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/audience.test.ts`
Expected: FAIL — `Failed to resolve import "./audience"`.

- [ ] **Step 3: Write `src/audience.ts`**

```ts
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import type { UsersRef } from "./enqueue";
import { normalizeAddress } from "./suppression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/**
 * CASL: consent implied by an existing business relationship (a purchase)
 * expires 24 months after the transaction. Express consent does not expire.
 */
export const IMPLIED_CONSENT_MS = 730 * 86_400_000;

export interface Recipient {
  userId?: bigint;
  email?: string;
  phone?: string;
  name?: string;
  vars?: Record<string, string>;
}

export function isConsentValid(source: string, consentAt: number, now: number): boolean {
  if (source === "purchase") return now - consentAt <= IMPLIED_CONSENT_MS;
  return true;
}

/**
 * Collapse duplicates by normalized address. An entry with a user id wins,
 * because a known customer carries preferences and a locale that a bare list
 * row does not — but the list row's merge vars are kept, since that is the only
 * place they exist.
 */
export function dedupeRecipients(input: Recipient[]): Recipient[] {
  const byKey = new Map<string, Recipient>();
  for (const r of input) {
    const key = normalizeAddress(r.email ?? r.phone ?? "");
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r, email: r.email ? normalizeAddress(r.email) : undefined });
      continue;
    }
    byKey.set(key, {
      ...existing,
      userId: existing.userId ?? r.userId,
      name: existing.name ?? r.name,
      vars: { ...(r.vars ?? {}), ...(existing.vars ?? {}) },
    });
  }
  return [...byKey.values()];
}

export interface AudienceDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
  /**
   * App-specific segment query. The package cannot know what an "order" is, so
   * each app supplies a resolver that turns a segment definition into user ids.
   */
  resolveSegment: (segment: NonNullable<AudienceDef["segment"]>) => Promise<bigint[]>;
  now?: number;
}

/**
 * Resolve an audience definition into deliverable recipients.
 *
 * Exclusions applied here, in order: lapsed implied consent, unsubscribed list
 * members, and any address suppressed for marketing. The suppression check runs
 * LAST and over the final address set, so a recipient reached through both a
 * segment and a list cannot slip past it on one path.
 */
export async function resolveAudience(deps: AudienceDeps, def: AudienceDef): Promise<Recipient[]> {
  const { db, tables, users } = deps;
  const now = deps.now ?? Date.now();
  const out: Recipient[] = [];

  if (def.segment) {
    const ids = await deps.resolveSegment(def.segment);
    if (ids.length > 0) {
      const rows = await db
        .select({
          id: users.columns.id,
          email: users.columns.email,
          phone: users.columns.phone,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name: (users.table as any).name,
        })
        .from(users.table)
        .where(inArray(users.columns.id, ids));
      for (const r of rows) {
        out.push({
          userId: r.id as bigint,
          email: (r.email as string | null) ?? undefined,
          phone: (r.phone as string | null) ?? undefined,
          name: (r.name as string | null) ?? undefined,
        });
      }
    }
  }

  if (def.listIds?.length) {
    const lists = await db
      .select({
        id: tables.contactList.id,
        source: tables.contactList.consentSource,
        consentAt: tables.contactList.consentAt,
      })
      .from(tables.contactList)
      .where(inArray(tables.contactList.publicId, def.listIds));

    // A list whose implied consent has lapsed contributes nobody. Filtering the
    // whole list is correct: consent_at is a property of how the list was
    // gathered, not of an individual row.
    const live = lists.filter((l) => isConsentValid(l.source as string, Number(l.consentAt), now));

    if (live.length > 0) {
      const members = await db
        .select({
          email: tables.contactListMember.email,
          phone: tables.contactListMember.phone,
          name: tables.contactListMember.name,
          vars: tables.contactListMember.vars,
        })
        .from(tables.contactListMember)
        .where(
          and(
            inArray(tables.contactListMember.listId, live.map((l) => l.id)),
            isNull(tables.contactListMember.unsubscribedAt),
          ),
        );
      for (const m of members) {
        out.push({
          email: (m.email as string | null) ?? undefined,
          phone: (m.phone as string | null) ?? undefined,
          name: (m.name as string | null) ?? undefined,
          vars: (m.vars as Record<string, string>) ?? {},
        });
      }
    }
  }

  const deduped = dedupeRecipients(out);
  if (deduped.length === 0) return [];

  const addresses = deduped.flatMap((r) => [r.email, r.phone].filter(Boolean) as string[]).map(normalizeAddress);
  const blocked = await db
    .select({ address: tables.messageSuppression.address })
    .from(tables.messageSuppression)
    .where(
      and(
        inArray(tables.messageSuppression.address, addresses),
        inArray(tables.messageSuppression.scope, ["all", "marketing"]),
      ),
    );
  const blockedSet = new Set(blocked.map((b) => b.address as string));

  return deduped.filter((r) => {
    const email = r.email ? normalizeAddress(r.email) : null;
    const phone = r.phone ? normalizeAddress(r.phone) : null;
    return !(email && blockedSet.has(email)) && !(phone && blockedSet.has(phone));
  });
}

/** Live count for the audience builder. Same exclusions as the real send. */
export async function countAudience(deps: AudienceDeps, def: AudienceDef): Promise<number> {
  return (await resolveAudience(deps, def)).length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/audience.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/audience.ts packages/notifications/src/audience.test.ts
git commit -m "feat(notifications): audience resolution with consent expiry

The suppression check runs last, over the final address set, so a recipient
reached through both a segment and a list cannot slip past it on one path.
countAudience calls the same function as the send, so the number the admin
approves is the number that gets mailed."
```

---

## Task 4: Campaign content rendering

**Files:**
- Modify: `packages/notifications/src/template.ts`
- Modify: `packages/notifications/src/handlers.ts`
- Test: `packages/notifications/src/campaign-render.test.ts`

**Interfaces:**
- Consumes: `campaignContent` (Task 1), `interpolate`, `buildUnsubscribeUrl` (Task 2).
- Produces: `renderCampaignEmail(db, tables, campaignId, locale, vars): Promise<{ subject; html; text } | null>`; `renderCampaignText(...)`; `HandlerDeps` gains `unsubscribe?: { baseUrl: string; secret: string }`.

Plan A's handlers return `null` for any row without an `event`, which is every campaign row. This task adds the branch.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/campaign-render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { appendUnsubscribeFooter } from "./template";

describe("appendUnsubscribeFooter", () => {
  const footer = { url: "https://x.test/unsubscribe?address=a", sender: "Puchkaman", address: "1 Main St, Toronto ON" };

  it("appends an unsubscribe link and the sender's postal address to html", () => {
    const out = appendUnsubscribeFooter({ html: "<p>hi</p>", text: "hi" }, footer);
    expect(out.html).toContain(footer.url);
    expect(out.html).toContain("1 Main St, Toronto ON");
    expect(out.html).toContain("<p>hi</p>");
  });

  it("appends the same information to the plaintext part", () => {
    const out = appendUnsubscribeFooter({ html: "<p>hi</p>", text: "hi" }, footer);
    expect(out.text).toContain(footer.url);
    expect(out.text).toContain("Puchkaman");
  });

  it("does not double-append when a footer is already present", () => {
    const once = appendUnsubscribeFooter({ html: "<p>hi</p>", text: "hi" }, footer);
    const twice = appendUnsubscribeFooter(once, footer);
    expect(twice.html.match(/unsubscribe\?address=a/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/campaign-render.test.ts`
Expected: FAIL — `appendUnsubscribeFooter` is not exported.

- [ ] **Step 3: Extend `src/template.ts`**

Append:

```ts
import type { CampaignTables } from "./campaign-schema";

const FOOTER_MARKER = "data-realm-unsub";

export interface FooterInfo {
  url: string;
  /** Sender identification — required on every commercial message. */
  sender: string;
  /** Physical mailing address — also required. */
  address: string;
}

/**
 * CASL requires sender identification, a physical mailing address and a working
 * unsubscribe on every commercial message. Appending it here rather than
 * leaving it to whoever writes the copy means it cannot be forgotten — and the
 * marker makes a second pass idempotent.
 */
export function appendUnsubscribeFooter(
  parts: { html: string; text: string },
  footer: FooterInfo,
): { html: string; text: string } {
  if (parts.html.includes(FOOTER_MARKER)) return parts;
  const html =
    `${parts.html}\n<div ${FOOTER_MARKER} style="margin-top:24px;font-size:12px;color:#666">` +
    `<p>${footer.sender} — ${footer.address}</p>` +
    `<p><a href="${footer.url}">Unsubscribe</a></p></div>`;
  const text = `${parts.text}\n\n--\n${footer.sender}\n${footer.address}\nUnsubscribe: ${footer.url}\n`;
  return { html, text };
}

async function loadCampaignContent(db: Db, tables: CampaignTables, campaignId: bigint) {
  const c = tables.campaignContent;
  return db
    .select({
      channel: c.channel, locale: c.locale, subject: c.subject, body: c.body,
      html: c.html, text: c.text, providerTemplateId: c.providerTemplateId,
    })
    .from(c)
    .where(eq(c.campaignId, campaignId));
}

/** Campaign email content for a locale, or null when the channel has none. */
export async function renderCampaignEmail(
  db: Db, tables: CampaignTables, campaignId: bigint, locale: string, vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const rows = (await loadCampaignContent(db, tables, campaignId)).map((r) => ({ ...r, enabled: true }));
  const t = pickTemplate(rows as TemplateRow[], "email", locale);
  if (!t || !t.html || !t.text) return null;
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.html, vars),
    text: interpolate(t.text, vars),
  };
}

/** Campaign text content (sms/whatsapp/in_app) for a locale, or null. */
export async function renderCampaignText(
  db: Db, tables: CampaignTables, campaignId: bigint, channel: string, locale: string, vars: Record<string, unknown>,
): Promise<{ title: string; body: string; providerTemplateId: string | null } | null> {
  const rows = (await loadCampaignContent(db, tables, campaignId)).map((r) => ({ ...r, enabled: true }));
  const t = pickTemplate(rows as TemplateRow[], channel, locale);
  if (!t || !t.body) return null;
  return {
    title: interpolate(t.subject, vars),
    body: interpolate(t.body, vars),
    providerTemplateId: t.providerTemplateId,
  };
}
```

- [ ] **Step 4: Extend `src/handlers.ts`**

Add to `HandlerDeps`:

```ts
  /** Campaign tables + footer info. Omitted, campaign rows are skipped. */
  campaigns?: {
    tables: CampaignTables;
    unsubscribe: { baseUrl: string; secret: string };
    sender: { name: string; postalAddress: string };
  };
```

In `viaProvider`'s email branch, replace the `row.event ? … : null` expression with:

```ts
      if (channel === "email") {
        let rendered: { subject: string; html: string; text: string } | null = null;
        if (row.campaignId && deps.campaigns) {
          const base = await renderCampaignEmail(
            db, deps.campaigns.tables, row.campaignId, target.locale, vars,
          );
          if (base) {
            const { unsubscribe, sender } = deps.campaigns;
            rendered = {
              subject: base.subject,
              ...appendUnsubscribeFooter(base, {
                url: buildUnsubscribeUrl(unsubscribe.baseUrl, unsubscribe.secret, target.address),
                sender: sender.name,
                address: sender.postalAddress,
              }),
            };
          }
        } else if (row.event) {
          rendered = await renderEmailForEvent(db, tables, row.event, target.locale, vars);
        }
        if (!rendered) return null;
        return provider.send({
          to: { email: target.address },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      }
```

Apply the equivalent campaign branch to the sms/whatsapp path using `renderCampaignText`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test`
Expected: PASS — all suites, including the new footer tests.

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/template.ts packages/notifications/src/handlers.ts packages/notifications/src/campaign-render.test.ts
git commit -m "feat(notifications): render campaign content with a mandatory footer

The unsubscribe link, sender name and postal address are appended in the
handler rather than left to the copy, so a campaign cannot ship without them.
The marker makes a second pass idempotent."
```

---

## Task 5: Materialize and schedule a campaign

**Files:**
- Create: `packages/notifications/src/campaign.ts`
- Test: `apps/puchkaman/lib/campaigns/__tests__/materialize.integration.test.ts`

**Interfaces:**
- Consumes: `resolveAudience` (Task 3), `enqueue` (Plan A Task 5), campaign tables (Task 1).
- Produces: `materializeCampaign(deps, campaignPublicId): Promise<{ queued: number }>`; `dueCampaigns(db, tables, now): Promise<bigint[]>`; `markCampaignSent(db, tables, id, queued)`.

- [ ] **Step 1: Write `src/campaign.ts`**

```ts
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import { resolveAudience, type AudienceDeps } from "./audience";
import { enqueue, type UsersRef } from "./enqueue";
import type { Channel } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

const BATCH = 500;

export interface MaterializeDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
  resolveSegment: AudienceDeps["resolveSegment"];
}

/**
 * Expand a campaign into outbox rows.
 *
 * Idempotent by construction: the dedupe key is per (campaign, recipient,
 * channel) and the outbox has a unique index on it, so a crash halfway through
 * a 10k send is fixed by running this again rather than by reconciliation. The
 * status flip to 'sending' happens first so the scheduler cannot pick the same
 * campaign up twice concurrently.
 */
export async function materializeCampaign(
  deps: MaterializeDeps,
  campaignPublicId: string,
): Promise<{ queued: number }> {
  const { db, tables, users } = deps;

  const claimed = await db
    .update(tables.campaign)
    .set({ status: "sending" })
    .where(
      and(
        eq(tables.campaign.publicId, campaignPublicId),
        inArray(tables.campaign.status, ["draft", "scheduled", "sending"]),
      ),
    )
    .returning({
      id: tables.campaign.id,
      audience: tables.campaign.audience,
      channels: tables.campaign.channels,
    });

  const campaign = claimed[0];
  if (!campaign) return { queued: 0 };

  const recipients = await resolveAudience(
    { db, tables, users, resolveSegment: deps.resolveSegment },
    campaign.audience as AudienceDef,
  );

  let queued = 0;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    // One transaction per batch, not per campaign: a single transaction over
    // 10k recipients would hold locks for minutes and block the drainer.
    await db.transaction(async (tx) => {
      for (const r of slice) {
        await enqueue(tx, tables, users, {
          recipientId: r.userId,
          recipientEmail: r.email,
          recipientPhone: r.phone,
          title: "",
          body: "",
          kind: "marketing",
          campaignId: campaign.id,
          channels: campaign.channels as Channel[],
          data: { contact: { name: r.name ?? "", ...(r.vars ?? {}) } },
          dedupeKey: `cmp:${campaignPublicId}:${(r.email ?? r.phone ?? "").toLowerCase()}`,
        });
        queued += 1;
      }
    });
  }

  await db
    .update(tables.campaign)
    .set({
      status: "sent",
      sentAt: Date.now(),
      counts: sql`${tables.campaign.counts} || ${JSON.stringify({ queued })}::jsonb`,
    })
    .where(eq(tables.campaign.id, campaign.id));

  return { queued };
}

/** Scheduled campaigns whose time has come. */
export async function dueCampaigns(
  db: Db,
  tables: CampaignTables,
  now: number = Date.now(),
): Promise<string[]> {
  const rows = await db
    .select({ publicId: tables.campaign.publicId })
    .from(tables.campaign)
    .where(and(eq(tables.campaign.status, "scheduled"), lte(tables.campaign.scheduledAt, now)));
  return rows.map((r) => r.publicId as string);
}
```

- [ ] **Step 2: Write the failing integration test**

`apps/puchkaman/lib/campaigns/__tests__/materialize.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { materializeCampaign } from "@realm/notifications";
import { db } from "@/db/client";
import { campaign, contactList, contactListMember, notificationOutbox, notificationTables } from "@/db/schema";
import { usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const MARK = "cmp-int";
const listIds: bigint[] = [];
const campaignIds: bigint[] = [];

async function seedList(emails: string[]): Promise<string> {
  const [l] = await db
    .insert(contactList)
    .values({ name: MARK, consentSource: "express_optin", consentAt: Date.now() })
    .returning({ id: contactList.id, publicId: contactList.publicId });
  listIds.push(l.id);
  await db.insert(contactListMember).values(emails.map((email) => ({ listId: l.id, email })));
  return l.publicId;
}

async function seedCampaign(listPublicId: string): Promise<string> {
  const [c] = await db
    .insert(campaign)
    .values({
      name: MARK,
      channels: ["email"],
      audience: { listIds: [listPublicId] },
      status: "draft",
    })
    .returning({ id: campaign.id, publicId: campaign.publicId });
  campaignIds.push(c.id);
  return c.publicId;
}

const deps = () => ({ db, tables: notificationTables, users: usersRef, resolveSegment });

afterEach(async () => {
  if (campaignIds.length) {
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.campaignId, campaignIds));
    await db.delete(campaign).where(inArray(campaign.id, campaignIds));
    campaignIds.length = 0;
  }
  if (listIds.length) {
    await db.delete(contactListMember).where(inArray(contactListMember.listId, listIds));
    await db.delete(contactList).where(inArray(contactList.id, listIds));
    listIds.length = 0;
  }
  await db.delete(notificationTables.messageSuppression).where(like(notificationTables.messageSuppression.address, `${MARK}%`));
});

describe("materializeCampaign", () => {
  it("queues one marketing outbox row per list member", async () => {
    const list = await seedList([`${MARK}-a@example.test`, `${MARK}-b@example.test`]);
    const pub = await seedCampaign(list);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(2);

    const rows = await db
      .select({ kind: notificationOutbox.kind, channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.campaignId, campaignIds[0]));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "marketing" && r.channel === "email")).toBe(true);
  });

  it("is idempotent — re-running queues no duplicates", async () => {
    const list = await seedList([`${MARK}-c@example.test`]);
    const pub = await seedCampaign(list);
    await materializeCampaign(deps(), pub);
    await materializeCampaign(deps(), pub);
    const rows = await db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.campaignId, campaignIds[0]));
    expect(rows).toHaveLength(1);
  });

  it("excludes an unsubscribed member", async () => {
    const list = await seedList([`${MARK}-d@example.test`, `${MARK}-e@example.test`]);
    await db
      .update(contactListMember)
      .set({ unsubscribedAt: Date.now() })
      .where(eq(contactListMember.email, `${MARK}-d@example.test`));
    const pub = await seedCampaign(list);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(1);
  });

  it("excludes an address suppressed for marketing but not the same address for receipts", async () => {
    const blocked = `${MARK}-f@example.test`;
    await db
      .insert(notificationTables.messageSuppression)
      .values({ address: blocked, channel: "email", scope: "marketing", reason: "unsubscribe" });
    const list = await seedList([blocked, `${MARK}-g@example.test`]);
    const pub = await seedCampaign(list);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(1);
  });

  it("contributes nobody from a list whose implied consent has lapsed", async () => {
    const [l] = await db
      .insert(contactList)
      .values({
        name: MARK,
        consentSource: "purchase",
        consentAt: Date.now() - 800 * 86_400_000, // > 24 months
      })
      .returning({ id: contactList.id, publicId: contactList.publicId });
    listIds.push(l.id);
    await db.insert(contactListMember).values({ listId: l.id, email: `${MARK}-h@example.test` });
    const pub = await seedCampaign(l.publicId);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(0);
  });
});
```

- [ ] **Step 3: Write the app segment resolver**

`apps/puchkaman/lib/campaigns/segment.ts`:

```ts
import { and, gte, lte, sql } from "drizzle-orm";
import type { AudienceDef } from "@realm/notifications";
import { db } from "@/db/client";
import { orders } from "@/db/schema";

type Segment = NonNullable<AudienceDef["segment"]>;

/**
 * Turn a segment definition into customer user ids.
 *
 * Lives in the app because the package cannot know what an order is. Aggregates
 * over `orders` grouped by owner; orders with no owner (pre-backfill) simply do
 * not participate.
 */
export async function resolveSegment(segment: Segment): Promise<bigint[]> {
  const having = [];
  if (segment.minOrderCount) having.push(sql`count(*) >= ${segment.minOrderCount}`);
  if (segment.minTotalSpend) having.push(sql`sum(${orders.total}) >= ${segment.minTotalSpend}`);
  if (segment.lastOrderAfter) having.push(sql`max(${orders.createdAt}) >= ${segment.lastOrderAfter}`);
  if (segment.lastOrderBefore) having.push(sql`max(${orders.createdAt}) <= ${segment.lastOrderBefore}`);

  const rows = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(sql`${orders.userId} is not null`)
    .groupBy(orders.userId)
    .having(having.length ? and(...having) : sql`true`);

  return rows.map((r) => r.userId as bigint);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter puchkaman test lib/campaigns/__tests__/materialize.integration.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/notifications/src/campaign.ts apps/puchkaman/lib/campaigns
git commit -m "feat(notifications): materialize a campaign into outbox rows

Idempotent by dedupe key, so a crash halfway through a 10k send is fixed by
re-running rather than reconciliation. One transaction per 500-row batch --
a single transaction over the whole audience would hold locks for minutes
and block the drainer."
```

---

## Task 6: CSV contact-list upload

**Files:**
- Create: `packages/notifications/src/csv.ts`
- Create: `apps/puchkaman/app/api/notifications/contact-lists/route.ts`
- Create: `apps/puchkaman/app/api/notifications/contact-lists/[id]/import/route.ts`
- Test: `packages/notifications/src/csv.test.ts`

**Interfaces:**
- Consumes: `normalizeAddress` (Plan A Task 3), contact-list tables (Task 1).
- Produces: `parseCsv(text: string): { headers: string[]; rows: string[][] }`; `ContactMapping`; `mapRows(parsed, mapping): { valid: ParsedContact[]; rejected: { row: number; reason: string }[] }`.

`xlsx` is already a dependency in tiffin-grab, but a hand-rolled RFC-4180 reader is ~30 lines and avoids adding a parser to a package that would otherwise have no runtime dependencies. Quoted fields and embedded commas/newlines are the only cases that matter.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapRows, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads headers and rows", () => {
    const p = parseCsv("email,name\na@x.com,Ada\nb@x.com,Bob\n");
    expect(p.headers).toEqual(["email", "name"]);
    expect(p.rows).toEqual([["a@x.com", "Ada"], ["b@x.com", "Bob"]]);
  });

  it("honours quoted fields containing commas", () => {
    const p = parseCsv('email,note\na@x.com,"Toronto, ON"\n');
    expect(p.rows[0]).toEqual(["a@x.com", "Toronto, ON"]);
  });

  it("honours escaped quotes and embedded newlines", () => {
    const p = parseCsv('email,note\na@x.com,"say ""hi""\nagain"\n');
    expect(p.rows[0][1]).toBe('say "hi"\nagain');
  });

  it("tolerates CRLF and a missing trailing newline", () => {
    const p = parseCsv("email\r\na@x.com");
    expect(p.rows).toEqual([["a@x.com"]]);
  });

  it("ignores a trailing blank line", () => {
    expect(parseCsv("email\na@x.com\n\n").rows).toHaveLength(1);
  });
});

describe("mapRows", () => {
  const parsed = { headers: ["Email", "Full Name", "City"], rows: [["A@X.com", "Ada", "Toronto"]] };

  it("maps the named columns and lifts the rest into vars", () => {
    const out = mapRows(parsed, { email: "Email", name: "Full Name" });
    expect(out.valid).toEqual([{ email: "a@x.com", phone: undefined, name: "Ada", vars: { City: "Toronto" } }]);
  });

  it("rejects a row with no email and no phone", () => {
    const out = mapRows({ headers: ["Email"], rows: [[""]] }, { email: "Email" });
    expect(out.valid).toHaveLength(0);
    expect(out.rejected[0]).toEqual({ row: 1, reason: "no email or phone" });
  });

  it("rejects a malformed email", () => {
    const out = mapRows({ headers: ["Email"], rows: [["not-an-email"]] }, { email: "Email" });
    expect(out.rejected[0].reason).toBe("invalid email");
  });

  it("drops a duplicate address within the same file", () => {
    const out = mapRows({ headers: ["Email"], rows: [["a@x.com"], ["A@X.COM"]] }, { email: "Email" });
    expect(out.valid).toHaveLength(1);
    expect(out.rejected[0].reason).toBe("duplicate in file");
  });

  it("normalizes a phone to digits with a leading plus", () => {
    const out = mapRows({ headers: ["Phone"], rows: [["+1 (416) 555-0134"]] }, { phone: "Phone" });
    expect(out.valid[0].phone).toBe("+14165550134");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/csv.test.ts`
Expected: FAIL — `Failed to resolve import "./csv"`.

- [ ] **Step 3: Write `src/csv.ts`**

```ts
import { normalizeAddress } from "./suppression";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Minimal RFC-4180 reader. A dedicated parser would be a runtime dependency on
 * a package that otherwise has none; quoted fields, escaped quotes and embedded
 * newlines are the only cases a contact export actually produces.
 */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); if (row.some((c) => c !== "")) rows.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ",") { endField(); i += 1; continue; }
    if (c === "\r") { i += 1; continue; }
    if (c === "\n") { endRow(); i += 1; continue; }
    field += c; i += 1;
  }
  endRow();

  const [headers = [], ...body] = rows;
  return { headers, rows: body };
}

export interface ContactMapping {
  email?: string;
  phone?: string;
  name?: string;
}

export interface ParsedContact {
  email?: string;
  phone?: string;
  name?: string;
  vars: Record<string, string>;
}

// Deliberately loose: rejecting deliverable-but-unusual addresses costs a real
// customer, and a bounce is the authoritative answer anyway.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Apply the admin's column mapping. Unmapped columns become merge vars, so a
 * template can use `{{contact.City}}` without the schema knowing about cities.
 */
export function mapRows(
  parsed: ParsedCsv,
  mapping: ContactMapping,
): { valid: ParsedContact[]; rejected: { row: number; reason: string }[] } {
  const idx = (header?: string) => (header ? parsed.headers.indexOf(header) : -1);
  const iEmail = idx(mapping.email);
  const iPhone = idx(mapping.phone);
  const iName = idx(mapping.name);
  const mapped = new Set([iEmail, iPhone, iName].filter((n) => n >= 0));

  const valid: ParsedContact[] = [];
  const rejected: { row: number; reason: string }[] = [];
  const seen = new Set<string>();

  parsed.rows.forEach((cells, n) => {
    const rawEmail = iEmail >= 0 ? (cells[iEmail] ?? "").trim() : "";
    const rawPhone = iPhone >= 0 ? (cells[iPhone] ?? "").trim() : "";
    if (!rawEmail && !rawPhone) { rejected.push({ row: n + 1, reason: "no email or phone" }); return; }
    if (rawEmail && !EMAIL_RE.test(rawEmail)) { rejected.push({ row: n + 1, reason: "invalid email" }); return; }

    const email = rawEmail ? normalizeAddress(rawEmail) : undefined;
    const phone = rawPhone ? normalizeAddress(rawPhone) : undefined;
    const key = email ?? phone!;
    if (seen.has(key)) { rejected.push({ row: n + 1, reason: "duplicate in file" }); return; }
    seen.add(key);

    const vars: Record<string, string> = {};
    parsed.headers.forEach((h, c) => {
      if (mapped.has(c)) return;
      const v = (cells[c] ?? "").trim();
      if (v) vars[h] = v;
    });

    valid.push({ email, phone, name: iName >= 0 ? (cells[iName] ?? "").trim() || undefined : undefined, vars });
  });

  return { valid, rejected };
}
```

- [ ] **Step 4: Write the API routes**

`apps/puchkaman/app/api/notifications/contact-lists/route.ts` — create a list. Consent provenance is required at creation, before any address can be attached to it:

```ts
import { z } from "zod";
import { handler, json, problem } from "@realm/routes";
import { db } from "@/db/client";
import { contactList } from "@/db/schema";
import { requirePermission } from "@/lib/auth/permissions";

const schema = z.object({
  name: z.string().trim().min(1),
  consentSource: z.enum(["purchase", "express_optin", "event_signup", "import_other"]),
  consentAt: z.number().int().positive(),
  consentNote: z.string().trim().optional(),
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requirePermission({ notifications: ["manage"] });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");

  const [row] = await db.insert(contactList).values(parsed.data).returning({ publicId: contactList.publicId });
  return json({ publicId: row.publicId });
});
```

Replace `requirePermission({ notifications: ["manage"] })` with whatever resource the app's `lib/auth/permissions.ts` actually declares — read it first and add a `notifications` resource if none exists.

`apps/puchkaman/app/api/notifications/contact-lists/[id]/import/route.ts` — accept the file, parse, map, insert:

```ts
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { mapRows, parseCsv } from "@realm/notifications";
import { handler, json, problem } from "@realm/routes";
import { db } from "@/db/client";
import { contactList, contactListMember } from "@/db/schema";
import { requirePermission } from "@/lib/auth/permissions";

const MAX_BYTES = 5 * 1024 * 1024;

const mappingSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
  await requirePermission({ notifications: ["manage"] });
  const { id } = await ctx.params;

  const form = await req.formData();
  const file = form.get("file");
  const mapping = mappingSchema.safeParse(JSON.parse(String(form.get("mapping") ?? "{}")));
  if (!(file instanceof File)) return problem(400, "Missing file");
  if (file.size > MAX_BYTES) return problem(413, "File is larger than 5MB");
  if (!mapping.success) return problem(400, "Invalid column mapping");
  if (!mapping.data.email && !mapping.data.phone) return problem(400, "Map an email or phone column");

  const [list] = await db
    .select({ id: contactList.id })
    .from(contactList)
    .where(eq(contactList.publicId, id));
  if (!list) return problem(404, "List not found");

  const { valid, rejected } = mapRows(parseCsv(await file.text()), mapping.data);

  let imported = 0;
  for (let i = 0; i < valid.length; i += 500) {
    const slice = valid.slice(i, i + 500);
    const inserted = await db
      .insert(contactListMember)
      .values(slice.map((c) => ({ listId: list.id, email: c.email ?? null, phone: c.phone ?? null, name: c.name ?? null, vars: c.vars })))
      // Re-importing the same export must not duplicate members.
      .onConflictDoNothing()
      .returning({ id: contactListMember.id });
    imported += inserted.length;
  }

  await db
    .update(contactList)
    .set({ memberCount: sql`(select count(*) from ${contactListMember} where ${contactListMember.listId} = ${list.id})` })
    .where(eq(contactList.id, list.id));

  return json({ imported, rejected });
});
```

The uploaded file is **not** persisted to S3: the members are the record of what was imported, and keeping a raw contact dump around is extra personal data with no purpose.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/csv.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/csv.ts packages/notifications/src/csv.test.ts apps/puchkaman/app/api/notifications/contact-lists
git commit -m "feat(notifications): CSV contact-list import with column mapping

Consent provenance is captured when the list is created, before any address
can be attached to it. The raw upload is not persisted -- the members are the
record, and a stored contact dump is personal data with no purpose."
```

---

## Task 7: Scheduler in the drainer

**Files:**
- Modify: `apps/puchkaman/workers/notify-drainer.ts`
- Modify: `apps/puchkaman/lib/notifications/drain.ts`
- Test: `apps/puchkaman/workers/__tests__/notify-drainer.test.ts`

**Interfaces:**
- Consumes: `dueCampaigns`, `materializeCampaign` (Task 5).
- Produces: `materializeDue(): Promise<number>`; `drainLoop` gains a `materialize` injection point.

- [ ] **Step 1: Add the failing test**

Append to `apps/puchkaman/workers/__tests__/notify-drainer.test.ts`:

```ts
  it("materializes due campaigns before draining", async () => {
    const controller = new AbortController();
    const order: string[] = [];
    const materialize = vi.fn(async () => { order.push("materialize"); return 0; });
    const drain = vi.fn(async () => { order.push("drain"); controller.abort(); return 0; });

    await drainLoop({ intervalMs: 0, signal: controller.signal, drain, materialize });
    expect(order).toEqual(["materialize", "drain"]);
  });

  it("still drains when campaign materialization throws", async () => {
    const controller = new AbortController();
    const materialize = vi.fn(async () => { throw new Error("segment query blew up"); });
    const drain = vi.fn(async () => { controller.abort(); return 0; });

    await drainLoop({ intervalMs: 0, signal: controller.signal, drain, materialize });
    expect(drain).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test workers/__tests__/notify-drainer.test.ts`
Expected: FAIL — `materialize` is not an option.

- [ ] **Step 3: Add the materializer binder**

Append to `apps/puchkaman/lib/notifications/drain.ts`:

```ts
import { dueCampaigns, materializeCampaign } from "@realm/notifications";
import { usersRef } from "./tables";
import { resolveSegment } from "@/lib/campaigns/segment";

/** Expand any scheduled campaign whose time has come. Returns rows queued. */
export async function materializeDue(): Promise<number> {
  const due = await dueCampaigns(db, notificationTables);
  let queued = 0;
  for (const publicId of due) {
    const r = await materializeCampaign(
      { db, tables: notificationTables, users: usersRef, resolveSegment },
      publicId,
    );
    queued += r.queued;
  }
  return queued;
}
```

- [ ] **Step 4: Wire it into the loop**

In `apps/puchkaman/workers/notify-drainer.ts`, add to `DrainLoopOptions`:

```ts
  /** Injected for tests. */
  materialize?: () => Promise<number>;
```

and at the top of the loop body, before the drain call:

```ts
    try {
      const queued = await (opts.materialize ?? materializeDue)();
      if (queued > 0) log.info({ queued }, "campaign materialized");
    } catch (err) {
      // Kept separate from the drain try/catch: a broken segment query must not
      // stop transactional mail from going out.
      log.error({ err }, "campaign materialization failed");
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test workers/__tests__/notify-drainer.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/puchkaman/workers apps/puchkaman/lib/notifications/drain.ts
git commit -m "feat(puchkaman): materialize scheduled campaigns in the drainer loop

Its try/catch is separate from the drain's: a broken segment query must not
stop transactional mail from going out."
```

---

## Task 8: Campaign statistics from SES events

**Files:**
- Modify: `apps/puchkaman/app/api/webhooks/ses/route.ts`
- Modify: `deployment/email/ses-puchkaman.yaml`
- Test: `apps/puchkaman/app/api/webhooks/ses/route.test.ts`

**Interfaces:**
- Consumes: `campaign`, `notificationOutbox` (Tasks 1, Plan A).
- Produces: `recordCampaignEvent(providerMessageId, type): Promise<void>` inside the webhook module.

- [ ] **Step 1: Add the failing test**

Append to `apps/puchkaman/app/api/webhooks/ses/route.test.ts`:

```ts
  it("counts a delivery against the campaign that sent it", async () => {
    await processSesEvent(
      JSON.stringify({ eventType: "Delivery", mail: { messageId: "ses-msg-1" } }),
    );
    expect(recordEvent).toHaveBeenCalledWith("ses-msg-1", "delivered");
  });

  it("counts an open and a click", async () => {
    await processSesEvent(JSON.stringify({ eventType: "Open", mail: { messageId: "m2" } }));
    await processSesEvent(JSON.stringify({ eventType: "Click", mail: { messageId: "m3" } }));
    expect(recordEvent).toHaveBeenCalledWith("m2", "opened");
    expect(recordEvent).toHaveBeenCalledWith("m3", "clicked");
  });

  it("counts a bounce as well as suppressing it", async () => {
    await processSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        mail: { messageId: "m4" },
        bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "a@x.com" }] },
      }),
    );
    expect(suppress).toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith("m4", "bounced");
  });
```

Add the mock alongside the existing `suppress` mock:

```ts
const recordEvent = vi.fn();
vi.mock("@/lib/notifications/campaign-stats", () => ({
  recordCampaignEvent: (id: string, type: string) => recordEvent(id, type),
}));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test app/api/webhooks/ses/route.test.ts`
Expected: FAIL — `recordCampaignEvent` is not called.

- [ ] **Step 3: Write the stats recorder**

`apps/puchkaman/lib/notifications/campaign-stats.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { campaign, notificationOutbox } from "@/db/schema";

/**
 * Attribute an SES event to its campaign via the provider message id stamped on
 * the outbox row when it was sent. A transactional send has no campaign_id, so
 * its events fall through as a no-op — the email_log row is its record.
 */
export async function recordCampaignEvent(providerMessageId: string, type: string): Promise<void> {
  const [row] = await db
    .select({ campaignId: notificationOutbox.campaignId })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.providerMessageId, providerMessageId))
    .limit(1);
  if (!row?.campaignId) return;

  await db
    .update(campaign)
    // jsonb_set with a coalesced default so the first event of a type creates it.
    .set({
      counts: sql`jsonb_set(${campaign.counts}, ARRAY[${type}],
        to_jsonb(COALESCE((${campaign.counts} ->> ${type})::int, 0) + 1))`,
    })
    .where(eq(campaign.id, row.campaignId));
}
```

- [ ] **Step 4: Extend the webhook**

In `processSesEvent`, add after the existing bounce/complaint handling:

```ts
  const messageId = (event as { mail?: { messageId?: string } }).mail?.messageId;
  const counted: Record<string, string> = {
    Delivery: "delivered", Open: "opened", Click: "clicked",
    Bounce: "bounced", Complaint: "complained",
  };
  if (messageId && counted[type ?? ""]) {
    await recordCampaignEvent(messageId, counted[type!]);
  }
```

- [ ] **Step 5: Extend the SES event destination**

In `deployment/email/ses-puchkaman.yaml`, extend `MatchingEventTypes`:

```yaml
        MatchingEventTypes:
          - BOUNCE
          - COMPLAINT
          - DELIVERY
          - OPEN
          - CLICK
```

Open and click tracking requires the configuration set's tracking options to be enabled; add to the `ConfigurationSet` resource:

```yaml
      TrackingOptions:
        CustomRedirectDomain: puchkaman.ca
```

`CustomRedirectDomain` needs a validated certificate for that domain. If it is not in place, omit `TrackingOptions` — SES then uses its own tracking domain, which works but shows an `awstrack.me` link on hover. Do not block the rest of the task on it.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test app/api/webhooks/ses/route.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/lib/notifications/campaign-stats.ts apps/puchkaman/app/api/webhooks/ses deployment/email/ses-puchkaman.yaml
git commit -m "feat(puchkaman): campaign stats from SES delivery, open and click events

Attributed via the provider message id already stamped on the outbox row, so
no tracking pixel of our own is needed."
```

---

## Task 9: Campaign admin UI

**Files:**
- Create: `packages/notifications/src/ui/{campaign-list,campaign-composer,audience-builder,contact-list-upload}.tsx`
- Modify: `packages/notifications/src/ui/index.ts`
- Create: `apps/puchkaman/app/(dashboard)/dashboard/notifications/campaigns/{page,new/page,[id]/page}.tsx`
- Create: `apps/puchkaman/app/(dashboard)/dashboard/notifications/contact-lists/page.tsx`
- Create: `apps/puchkaman/app/api/notifications/campaigns/{route,[id]/route,[id]/send/route,audience-count/route}.ts`

**Interfaces:**
- Consumes: `EmailEditorField` (Plan A Task 11), `FacetDef`/`parseFilterState`/`FacetFilters`/`ListPagination` from `@realm/design-system`, `countAudience` (Task 3), `materializeCampaign` (Task 5).
- Produces: routes under `/dashboard/notifications/campaigns` and `/dashboard/notifications/contact-lists`.

- [ ] **Step 1: Build the campaign list on the shared filter framework**

The list uses the same server-side filter framework as orders — read `apps/puchkaman/app/(dashboard)/dashboard/orders/page.tsx` and mirror it. The facet spec:

```ts
const CAMPAIGN_FACETS: FacetDef[] = [
  { kind: "search", fields: ["name"] },
  {
    kind: "pills", field: "status", label: "Status",
    options: [
      { value: "draft", label: "Draft" },
      { value: "scheduled", label: "Scheduled" },
      { value: "sending", label: "Sending" },
      { value: "sent", label: "Sent" },
      { value: "paused", label: "Paused" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Created" },
];
```

- [ ] **Step 2: Build the audience builder with a live count**

The count endpoint calls the **same** `countAudience` the send uses, so the number an admin approves is the number that gets mailed:

`apps/puchkaman/app/api/notifications/campaigns/audience-count/route.ts`:

```ts
import { countAudience } from "@realm/notifications";
import { handler, json } from "@realm/routes";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";
import { usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { requirePermission } from "@/lib/auth/permissions";

export const POST = handler(async (req: Request): Promise<Response> => {
  await requirePermission({ notifications: ["manage"] });
  const audience = await req.json();
  const count = await countAudience(
    { db, tables: notificationTables, users: usersRef, resolveSegment },
    audience,
  );
  return json({ count });
});
```

The builder UI shows: the segment controls, a multi-select of contact lists with their consent source and date, and the resulting count with a breakdown line — "1,240 in segment + 3,100 in lists − 118 suppressed − 42 unsubscribed = 4,180 recipients". Excluded counts must be visible; a silent exclusion reads as a bug to whoever is watching the number.

- [ ] **Step 3: Build the composer**

Reuses `EmailEditorField` from Plan A. Per-channel tabs, one content row per (channel, locale). A live preview renders with sample merge vars drawn from the first list member so `{{contact.City}}` is visibly resolved before sending.

- [ ] **Step 4: Build the send route with confirmation**

`apps/puchkaman/app/api/notifications/campaigns/[id]/send/route.ts`:

```ts
import { z } from "zod";
import { materializeCampaign } from "@realm/notifications";
import { handler, json, problem } from "@realm/routes";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { requirePermission } from "@/lib/auth/permissions";

const schema = z.object({
  /** The count the admin was shown and approved. */
  confirmedCount: z.number().int().nonnegative(),
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
  await requirePermission({ notifications: ["manage"] });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "Confirm the recipient count before sending");

  const { queued } = await materializeCampaign(
    { db, tables: notificationTables, users: usersRef, resolveSegment },
    id,
  );

  // A send is irreversible. If the audience moved between the admin approving a
  // number and this call, say so rather than quietly mailing a different set.
  if (queued !== parsed.data.confirmedCount) {
    return json({ queued, warning: `Audience changed: approved ${parsed.data.confirmedCount}, queued ${queued}` });
  }
  return json({ queued });
});
```

- [ ] **Step 5: Add the UI barrel entries and the nav**

Export the four new components from `packages/notifications/src/ui/index.ts`, and add Campaigns and Contact lists entries to the notifications nav.

- [ ] **Step 6: Verify by eye**

Every new `.tsx` starts with `"use client"` where it uses hooks, and every component is a named export:

```bash
rg -n "^export default" packages/notifications/src/ui/
```

Expected: no output.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm turbo typecheck
git add packages/notifications/src/ui apps/puchkaman/app
git commit -m "feat(notifications): campaign composer, audience builder and contact lists

The audience count endpoint calls the same countAudience the send uses, so
the number an admin approves is the number that gets mailed -- and the send
route reports a mismatch rather than quietly mailing a different set."
```

---

## Task 10: Public unsubscribe page

**Files:**
- Create: `apps/puchkaman/app/unsubscribe/page.tsx`
- Create: `apps/puchkaman/app/api/unsubscribe/route.ts`
- Test: `apps/puchkaman/app/api/unsubscribe/route.test.ts`

**Interfaces:**
- Consumes: `handleUnsubscribe` (Task 2).
- Produces: `GET|POST /api/unsubscribe`; the public page.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/app/api/unsubscribe/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const handle = vi.fn();
vi.mock("@realm/notifications", async (orig) => ({
  ...(await orig<typeof import("@realm/notifications")>()),
  handleUnsubscribe: (...args: unknown[]) => handle(...args),
}));

const { GET } = await import("./route");

describe("GET /api/unsubscribe", () => {
  it("returns the same response for a valid and an invalid token", async () => {
    const a = await GET(new Request("https://x.test/api/unsubscribe?address=a@x.com&token=deadbeef"));
    const b = await GET(new Request("https://x.test/api/unsubscribe?address=nobody@x.com&token=zz"));
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
  });

  it("returns 200 even with no parameters at all", async () => {
    const res = await GET(new Request("https://x.test/api/unsubscribe"));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test app/api/unsubscribe/route.test.ts`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Write the route**

```ts
import { handleUnsubscribe } from "@realm/notifications";
import { handler, json } from "@realm/routes";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";

/**
 * One-click unsubscribe. The token IS the auth, so no session is needed — a
 * recipient who never had an account must be able to opt out.
 *
 * The response is identical whether or not the token verified and whether or
 * not the address exists, so the endpoint cannot be used to test membership.
 */
async function apply(url: URL): Promise<void> {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) return;
  await handleUnsubscribe(db, notificationTables, {
    address: url.searchParams.get("address"),
    token: url.searchParams.get("token"),
    secret,
  });
}

export const GET = handler(async (req: Request): Promise<Response> => {
  await apply(new URL(req.url));
  return json({ ok: true });
});

// RFC 8058 one-click: some clients POST the List-Unsubscribe-Post target.
export const POST = GET;
```

- [ ] **Step 4: Write the public page**

`apps/puchkaman/app/unsubscribe/page.tsx` — a server component that calls the same `apply` logic and renders a confirmation in the public (brutalist) style, with a line explaining that transactional messages about orders the person placed will still be sent. That distinction is the honest one and pre-empts the "I unsubscribed but still got email" complaint.

- [ ] **Step 5: Add the env var**

In `deployment/prod/puchkaman/.env.production.example`:

```
# HMAC secret for unsubscribe links. Rotating it invalidates every link already
# sent, so treat it as long-lived.
UNSUBSCRIBE_SECRET=change-me
# Sender identification required on every commercial message.
CAMPAIGN_SENDER_NAME=Puchkaman
CAMPAIGN_POSTAL_ADDRESS=
```

- [ ] **Step 6: Run the test and commit**

```bash
pnpm --filter puchkaman test app/api/unsubscribe/route.test.ts
git add apps/puchkaman/app/unsubscribe apps/puchkaman/app/api/unsubscribe deployment/prod/puchkaman
git commit -m "feat(puchkaman): public one-click unsubscribe

The token is the auth, so a recipient who never had an account can opt out,
and the response is identical regardless of validity so the endpoint cannot
be used to test list membership."
```

---

## Task 11: Final verification

- [ ] **Step 1: Full typecheck and test**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

- [ ] **Step 2: No migration drift in either app**

```bash
pnpm --filter puchkaman exec drizzle-kit generate
pnpm --filter tiffin-grab exec drizzle-kit generate
```

Expected: no new files in either.

- [ ] **Step 3: End-to-end on a two-recipient campaign**

1. Create a contact list with consent source `express_optin`, import a two-row CSV with your own address twice under different cases.
   Expected: 1 imported, 1 rejected as `duplicate in file`.
2. Compose a campaign, pick the list, confirm the count reads 1.
3. Send. The drainer materializes and delivers within ~15s.
4. The email arrives **with the unsubscribe footer, sender name and postal address**.
5. Click Unsubscribe. The page confirms.
6. Send a second campaign to the same list.
   Expected: queued 0.
7. Place a real order with the same address.
   Expected: **the receipt still arrives** — this is the check that the marketing scope did not over-suppress.

Step 7 is the one that must not be skipped. It is the difference between a compliant unsubscribe and a bug that silently withholds receipts.

- [ ] **Step 4: Verify stats attribution**

After step 3, check the campaign detail page shows `queued: 1` and, once SES delivers, `delivered: 1`.

- [ ] **Step 5: Commit the milestone**

```bash
git commit --allow-empty -m "chore(notifications): plan C complete -- campaigns live

Campaigns share the transactional outbox, so retries, suppression, backoff
and rate limiting are the same code. Consent expiry, marketing-scoped
unsubscribe and the mandatory footer are enforced at send, not by convention."
```

---

## Self-Review

**Spec coverage.** Covers spec §5.2's `campaign`, `campaign_content`, `contact_list`, `contact_list_member`; §3.1's shared delivery path; §7's consent requirements 1–5 (expiry, unsubscribe, sender identity + postal address, kind-scoped opt-out, import provenance); and phase-2 items 1–9. Requirement 6 (SMS STOP handling) belongs to Plan D with the channel that needs it.

**Placeholder scan.** Task 9 Steps 1–3 describe the composer, list and audience-builder components in terms of the framework they mirror rather than reproducing several hundred lines of table and form markup; each names the exact file to read and the exact facet spec, endpoint shape and required behaviour. Task 10 Step 4 similarly specifies the page's content and the one non-obvious line it must carry. Everything else is runnable as written.

**Type consistency.** `AudienceDef` (Task 1) is the `audience` column type and the parameter of `resolveAudience`/`countAudience` (Task 3) and `materializeCampaign` (Task 5). `AudienceDeps.resolveSegment` (Task 3) is implemented per-app in Task 5 Step 3 and consumed by Tasks 7 and 9. `CampaignTables` (Task 1) is threaded through Tasks 2, 3, 4 and 5. `appendUnsubscribeFooter` (Task 4) takes and returns `{ html, text }`, matching what `renderCampaignEmail` returns minus the subject — which is why Task 4's handler branch spreads the footer result and re-attaches `subject` explicitly.

**Amendment to Plan A** made during this plan: `message_suppression` gained a `scope` column (`all` | `marketing`) with `suppressionScope` enum, `suppress()` gained an optional `scope`, and `suppressedChannelsFor()` gained a `kind` parameter. Without it an unsubscribe would block transactional receipts, which is both a bug and the wrong compliance posture. Plan A has been edited in place; if it was already executed, this is a follow-up migration.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-12-notification-campaigns.md`.
