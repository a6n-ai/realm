# Notification Templates, Events & Localization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-editable, localized, event-driven notification templates that render Markdown through react-email and feed the existing outbox/drainer/SES/in-app pipeline.

**Architecture:** One unified `app_event` enum (shared by wallet payouts + notifications). A `notification_template` table keyed `(event, channel, locale)` holds admin-authored Markdown. At send time the drainer looks up the template (recipient locale → `en` → generic fallback), interpolates `{{entity.field}}` from the outbox payload snapshot, and renders via react-email to HTML + plaintext. An admin settings page edits templates with a Markdown editor, variable pills, live preview, locale tabs, and test-send.

**Tech Stack:** Drizzle ORM + Postgres, Next.js 16 route handlers, `react-email` v6 (render + `<Markdown>`), `@uiw/react-md-editor` (editor), Vitest, shadcn UI.

## Global Constraints

- Templates are the live source; **no DB row → generic branded fallback** (a new event never silently fails to send).
- Variables are **direct DB columns only**, referenced `{{entity.field}}`; calculated vars deferred.
- Locales: **`en`, `fr`** only (default `en`). Recipient locale → `en` fallback at render.
- All editor/render libraries must be **free + OSS (MIT/BSD)**: `react-email`, `@uiw/react-md-editor`.
- Shared code → `@tiffin/commons*` packages, never duplicated in `apps/web` ([[commons-packages-convention]]).
- DB writes go through the service layer; admin controls are typed (no free-text enum/date) ([[admin-typed-controls]], [[services-extend-commons-convention]]).
- Timestamps are epoch-ms via `Date.now()` from `baseColumns`/`updatableColumns`.
- No Claude co-author trailer in commits.
- Manual broadcast is OUT OF SCOPE (separate future plan). `notification_template.event` stays NOT NULL.

---

## File Structure

**Schema / migrations**
- `apps/web/db/schema/wallet.ts` — rename `businessEvent` → `appEvent`, expand values (modify).
- `apps/web/db/schema/notifications.ts` — drop `notificationEvent`; repoint `event` columns to `appEvent` (modify).
- `apps/web/db/schema/auth.ts` — add `locale` enum + `users.locale` (modify).
- `apps/web/db/schema/notification-template.ts` — new `notification_template` table (create).
- `apps/web/db/schema/index.ts` — export new schema (modify).
- `apps/web/db/migrations/00NN_*.sql` — hand-authored enum rename/add + new table + locale (create).

**Notification engine (`apps/web/lib/notifications/`)**
- `event-entities.ts` — `EVENT_ENTITY` registry + variable validation (create).
- `interpolate.ts` — pure `{{entity.field}}` interpolation (create).
- `render-email.tsx` — react-email branded layout + `renderTemplate()` → html/text (create).
- `template-service.ts` — DB lookup with locale/generic fallback → rendered output (create).
- `handlers.ts` — rewire email/in_app to use `template-service` (modify).
- `enqueue.ts` — carry `vars` snapshot in payload (modify).
- `templates.ts` — DELETE (replaced by render-email generic fallback).

**Admin API + UI**
- `apps/web/lib/services/notification-template.service.ts` — CRUD service (create).
- `apps/web/app/api/notifications/templates/route.ts` — list/upsert (create).
- `apps/web/app/api/notifications/templates/preview/route.ts` — render preview (create).
- `apps/web/app/api/notifications/templates/test/route.ts` — send test email (create).
- `apps/web/app/(dashboard)/dashboard/settings/notifications/page.tsx` — event list (create).
- `apps/web/components/notifications/template-editor.tsx` — editor client component (create).
- `apps/web/db/seed-notification-templates.ts` — seed defaults (create).

---

## Task 1: Unified `app_event` enum

**Files:**
- Modify: `apps/web/db/schema/wallet.ts`
- Modify: `apps/web/db/schema/notifications.ts`
- Create: `apps/web/db/migrations/<next>_unify_app_event.sql`
- Modify: `apps/web/db/migrations/meta/_journal.json` (via db:generate for the table tasks; this enum migration is hand-authored — see Step 3)

**Interfaces:**
- Produces: `appEvent` pgEnum (exported from `wallet.ts`), values listed below. Consumed by `notification_outbox.event`, `notifications.event`, `event_payout.eventType`, `wallet_ledger.eventType`, and `notification_template.event` (Task 3).

- [ ] **Step 1: Rename + expand the enum in `wallet.ts`**

Replace the `businessEvent` definition:

```ts
// Unified app-wide event catalog. Wallet payouts AND notification templates
// key off this. An event need not have a payout or a template.
export const appEvent = pgEnum("app_event", [
  "order_created", "order_activated", "order_completed", "order_cancelled", "order_paused",
  "payment_received", "refund_issued",
  "menu_released",
  "wallet_credited", "wallet_redeemed",
  "inquiry_created", "inquiry_follow_up", "inquiry_converted",
  "ticket_created", "ticket_reply", "ticket_resolved",
  "signup", "manual_adjustment",
]);
```

Update references in `wallet.ts`: change `businessEvent("event_type")` → `appEvent("event_type")` on both `walletLedger.eventType` and `eventPayout.eventType`.

- [ ] **Step 2: Repoint `notifications.ts`**

In `apps/web/db/schema/notifications.ts`: delete the `notificationEvent` pgEnum block. Import `appEvent` from `./wallet` and replace both `notificationEvent("event")` usages (on `notifications` and `notificationOutbox`) with `appEvent("event")`.

```ts
import { appEvent } from "./wallet";
// notifications:        event: appEvent("event").notNull(),
// notificationOutbox:   event: appEvent("event").notNull(),
```

- [ ] **Step 3: Hand-author the enum migration**

Drizzle generates a drop/recreate for enum renames, which would fail against existing columns. Author the migration explicitly. Create `apps/web/db/migrations/<NN>_unify_app_event.sql` (use the next sequence number; add a matching `meta/<NN>_snapshot.json` by running `db:generate` AFTER editing schema, then replace the auto enum SQL with this):

```sql
ALTER TYPE "business_event" RENAME TO "app_event";--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'order_cancelled';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'order_paused';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'payment_received';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'refund_issued';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'menu_released';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'wallet_credited';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'wallet_redeemed';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'inquiry_created';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'inquiry_follow_up';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'inquiry_converted';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'ticket_created';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'ticket_reply';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'ticket_resolved';--> statement-breakpoint
ALTER TYPE "app_event" ADD VALUE IF NOT EXISTS 'signup';
```

> Note: the prior `notification_event` enum was only ever on `notifications`/`notification_outbox` (created in migration 0009, not yet relied on by data). Repoint those columns to `app_event`:

```sql
ALTER TABLE "notifications" ALTER COLUMN "event" TYPE "app_event" USING "event"::text::"app_event";--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "event" TYPE "app_event" USING "event"::text::"app_event";--> statement-breakpoint
DROP TYPE IF EXISTS "notification_event";
```

- [ ] **Step 4: Apply + verify**

Run (loads env like the project does — see prior session): from `apps/web`, `set -a; . ./.env.local; set +a; pnpm exec drizzle-kit migrate`
Expected: migrations applied. Verify: `psql "$DATABASE_URL" -c "select enum_range(null::app_event)"` includes all 18 values and `select 1 from pg_type where typname='notification_event'` returns 0 rows.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter web typecheck` → no errors.

```bash
git add apps/web/db
git commit -m "feat(notify): unify business_event + notification_event into app_event"
```

---

## Task 2: `locale` enum + `users.locale`

**Files:**
- Modify: `apps/web/db/schema/auth.ts`
- Create: migration via `db:generate`

**Interfaces:**
- Produces: `locale` pgEnum (`en` | `fr`) exported from `auth.ts`; `users.locale` column (default `en`). Consumed by Task 3 (`notification_template.locale`) and Task 7 (recipient locale lookup).

- [ ] **Step 1: Add the enum + column**

In `apps/web/db/schema/auth.ts`, add near `userRole`:

```ts
export const locale = pgEnum("locale", ["en", "fr"]);
```

Add to the `users` table columns (after `notifySms`):

```ts
    locale: locale("locale").notNull().default("en"),
```

- [ ] **Step 2: Generate + apply migration**

Run from `apps/web`: `pnpm exec drizzle-kit generate` then `set -a; . ./.env.local; set +a; pnpm exec drizzle-kit migrate`
Expected: creates `locale` type + adds `users.locale` default `en`.

- [ ] **Step 3: Verify + commit**

Verify: `psql "$DATABASE_URL" -c "select distinct locale from users"` → all `en`.

```bash
git add apps/web/db
git commit -m "feat(notify): add locale enum + users.locale"
```

---

## Task 3: `notification_template` table

**Files:**
- Create: `apps/web/db/schema/notification-template.ts`
- Modify: `apps/web/db/schema/index.ts`
- Create: migration via `db:generate`

**Interfaces:**
- Produces: `notificationTemplate` table. Columns: `event appEvent`, `channel notificationChannel`, `locale`, `subject text`, `body text`, `enabled boolean`. Unique `(event, channel, locale)`. Consumed by Task 7 (lookup) and Task 10 (CRUD).

- [ ] **Step 1: Create the table**

```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { appEvent } from "./wallet";
import { notificationChannel } from "./notifications";
import { locale } from "./auth";

export const notificationTemplate = pgTable("notification_template", {
  ...updatableColumns("ntp"),
  event: appEvent("event").notNull(),
  channel: notificationChannel("channel").notNull(),
  locale: locale("locale").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
}, (t) => [
  uniqueIndex("notification_template_key_idx").on(t.event, t.channel, t.locale),
]);
```

- [ ] **Step 2: Export it**

Add to `apps/web/db/schema/index.ts`: `export * from "./notification-template";`

- [ ] **Step 3: Generate + apply + verify + commit**

Run from `apps/web`: `pnpm exec drizzle-kit generate` then migrate (env-loaded as above).
Verify: `psql "$DATABASE_URL" -c "\d notification_template"` shows the unique index.

```bash
git add apps/web/db
git commit -m "feat(notify): notification_template table"
```

---

## Task 4: Event → variable registry

**Files:**
- Create: `apps/web/lib/notifications/event-entities.ts`
- Test: `apps/web/lib/notifications/event-entities.test.ts`

**Interfaces:**
- Produces: `type AppEvent`, `EVENT_ENTITY`, `availableVariables(event): string[]` (returns `["order.code", ...]`), `validateTemplateVars(event, body): string[]` (returns unknown variables found). Consumed by Tasks 5, 8, 10, 11.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { availableVariables, validateTemplateVars } from "./event-entities";

describe("event-entities", () => {
  it("lists entity-prefixed variables for an event", () => {
    expect(availableVariables("order_activated")).toContain("order.code");
  });
  it("returns no unknown vars when the template only uses known ones", () => {
    expect(validateTemplateVars("order_activated", "Hi {{order.code}}")).toEqual([]);
  });
  it("flags unknown variables", () => {
    expect(validateTemplateVars("order_activated", "{{order.nope}} {{x.y}}")).toEqual(["order.nope", "x.y"]);
  });
  it("returns [] available for events with no entity", () => {
    expect(availableVariables("manual_adjustment")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `pnpm --filter web exec vitest run lib/notifications/event-entities.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the registry**

```ts
import { appEvent } from "@/db/schema";

export type AppEvent = (typeof appEvent.enumValues)[number];

interface Field { name: string; label: string }
interface EntityVars { entity: string; fields: Field[] }

export const EVENT_ENTITY: Partial<Record<AppEvent, EntityVars>> = {
  order_created:   { entity: "order", fields: [
    { name: "code", label: "Order code" }, { name: "customerName", label: "Customer name" }] },
  order_activated: { entity: "order", fields: [
    { name: "code", label: "Order code" }, { name: "planType", label: "Plan type" },
    { name: "total", label: "Total" }, { name: "startDate", label: "Start date" },
    { name: "customerName", label: "Customer name" }] },
  order_cancelled: { entity: "order", fields: [
    { name: "code", label: "Order code" }, { name: "customerName", label: "Customer name" }] },
  payment_received: { entity: "payment", fields: [
    { name: "amount", label: "Amount" }, { name: "orderCode", label: "Order code" }] },
  refund_issued:    { entity: "payment", fields: [
    { name: "amount", label: "Amount" }, { name: "orderCode", label: "Order code" }] },
  menu_released:    { entity: "menuWeek", fields: [
    { name: "weekStartIso", label: "Week starting" }, { name: "cutoffLabel", label: "Cutoff" }] },
  wallet_credited:  { entity: "wallet", fields: [
    { name: "coins", label: "Coins" }, { name: "reason", label: "Reason" }] },
  ticket_reply:     { entity: "ticket", fields: [
    { name: "subject", label: "Subject" }, { name: "code", label: "Ticket code" }] },
  inquiry_follow_up:{ entity: "inquiry", fields: [
    { name: "customerName", label: "Customer name" }] },
};

export function availableVariables(event: AppEvent): string[] {
  const e = EVENT_ENTITY[event];
  return e ? e.fields.map((f) => `${e.entity}.${f.name}`) : [];
}

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function validateTemplateVars(event: AppEvent, body: string): string[] {
  const known = new Set(availableVariables(event));
  const unknown: string[] = [];
  for (const m of body.matchAll(VAR_RE)) {
    const v = m[1];
    if (!known.has(v) && !unknown.includes(v)) unknown.push(v);
  }
  return unknown;
}
```

- [ ] **Step 4: Run → passes**

Run: `pnpm --filter web exec vitest run lib/notifications/event-entities.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/notifications/event-entities.ts apps/web/lib/notifications/event-entities.test.ts
git commit -m "feat(notify): event→variable registry"
```

---

## Task 5: Variable interpolation

**Files:**
- Create: `apps/web/lib/notifications/interpolate.ts`
- Test: `apps/web/lib/notifications/interpolate.test.ts`

**Interfaces:**
- Produces: `interpolate(template: string, vars: Record<string, unknown>): string`. Resolves `{{a.b}}` from nested `vars`. Consumed by Task 6/7.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate";

describe("interpolate", () => {
  it("replaces nested dotted vars", () => {
    expect(interpolate("Order {{order.code}}", { order: { code: "TG-1" } })).toBe("Order TG-1");
  });
  it("renders missing vars as empty string", () => {
    expect(interpolate("X{{order.nope}}Y", { order: {} })).toBe("XY");
  });
  it("stringifies non-string values", () => {
    expect(interpolate("{{p.amount}}", { p: { amount: 12.5 } })).toBe("12.5");
  });
  it("tolerates whitespace in braces", () => {
    expect(interpolate("{{ order.code }}", { order: { code: "A" } })).toBe("A");
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `pnpm --filter web exec vitest run lib/notifications/interpolate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Replace {{a.b}} with the resolved value from `vars`; missing → "". */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(VAR_RE, (_m, path: string) => {
    const value = path.split(".").reduce<unknown>(
      (acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      vars,
    );
    return value == null ? "" : String(value);
  });
}
```

- [ ] **Step 4: Run → passes**

Run: `pnpm --filter web exec vitest run lib/notifications/interpolate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/notifications/interpolate.ts apps/web/lib/notifications/interpolate.test.ts
git commit -m "feat(notify): variable interpolation"
```

---

## Task 6: react-email render module

**Files:**
- Create: `apps/web/lib/notifications/render-email.tsx`
- Test: `apps/web/lib/notifications/render-email.test.ts`
- Modify: `apps/web/package.json` (add `react-email`)

**Interfaces:**
- Consumes: `interpolate` (Task 5).
- Produces:
  - `renderEmailTemplate(input: { subject: string; body: string; vars: Record<string, unknown> }): Promise<{ subject: string; html: string; text: string }>`
  - `renderInApp(input: { subject: string; body: string; vars: Record<string, unknown> }): { title: string; body: string }`
  Consumed by Task 7.

- [ ] **Step 1: Add the dependency**

Edit `apps/web/package.json` dependencies: add `"react-email": "^6.0.0"`. Run `pnpm install`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderEmailTemplate, renderInApp } from "./render-email";

describe("render-email", () => {
  it("interpolates + renders markdown to HTML", async () => {
    const out = await renderEmailTemplate({
      subject: "Order {{order.code}}",
      body: "# Hi {{order.customerName}}\n\nYour order **{{order.code}}** is active.",
      vars: { order: { code: "TG-9", customerName: "Sam" } },
    });
    expect(out.subject).toBe("Order TG-9");
    expect(out.html).toContain("TG-9");
    expect(out.html.toLowerCase()).toContain("<html");
    expect(out.text).toContain("TG-9");
  });

  it("renders in-app title + plaintext body", () => {
    const out = renderInApp({
      subject: "Order {{order.code}}",
      body: "Your order {{order.code}} is active.",
      vars: { order: { code: "TG-9" } },
    });
    expect(out.title).toBe("Order TG-9");
    expect(out.body).toBe("Your order TG-9 is active.");
  });
});
```

- [ ] **Step 3: Run → fails**

Run: `pnpm --filter web exec vitest run lib/notifications/render-email.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the render module**

```tsx
import { render, Html, Head, Body, Container, Heading, Markdown } from "react-email";
import { interpolate } from "./interpolate";

const BRAND = { fontFamily: "system-ui, sans-serif", color: "#111", maxWidth: "520px" };

function BrandedEmail({ markdown }: { markdown: string }) {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: "#f6f6f6", margin: 0 }}>
        <Container style={{ ...BRAND, margin: "0 auto", padding: "24px", background: "#fff" }}>
          <Heading style={{ margin: "0 0 8px" }}>Tiffin Grab</Heading>
          <Markdown>{markdown}</Markdown>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderEmailTemplate(input: {
  subject: string; body: string; vars: Record<string, unknown>;
}): Promise<{ subject: string; html: string; text: string }> {
  const subject = interpolate(input.subject, input.vars);
  const markdown = interpolate(input.body, input.vars);
  const html = await render(<BrandedEmail markdown={markdown} />);
  const text = await render(<BrandedEmail markdown={markdown} />, { plainText: true });
  return { subject, html, text };
}

export function renderInApp(input: {
  subject: string; body: string; vars: Record<string, unknown>;
}): { title: string; body: string } {
  return {
    title: interpolate(input.subject, input.vars),
    body: interpolate(input.body, input.vars),
  };
}
```

> If `react-email` v6 does not export a component (e.g. `Markdown`) from the root, import components from `@react-email/components` instead and add it to `package.json`. Confirm exact exports against `node_modules/react-email` before finalizing.

- [ ] **Step 5: Run → passes**

Run: `pnpm --filter web exec vitest run lib/notifications/render-email.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/notifications/render-email.tsx apps/web/lib/notifications/render-email.test.ts apps/web/package.json ../../pnpm-lock.yaml
git commit -m "feat(notify): react-email render module"
```

---

## Task 7: Template service (DB lookup + fallback)

**Files:**
- Create: `apps/web/lib/notifications/template-service.ts`
- Test: `apps/web/lib/notifications/template-service.test.ts`

**Interfaces:**
- Consumes: `notificationTemplate` schema, `renderEmailTemplate`/`renderInApp` (Task 6).
- Produces: `resolveTemplate(event, channel, locale): Promise<{ subject: string; body: string } | null>` (locale → `en` fallback, respects `enabled`); `GENERIC_FALLBACK(vars)` from payload title/body. Consumed by Task 8.

- [ ] **Step 1: Write the failing test (locale fallback logic is the unit under test)**

```ts
import { describe, expect, it } from "vitest";
import { pickTemplate } from "./template-service";

const rows = [
  { channel: "email", locale: "en", subject: "EN {{order.code}}", body: "en body", enabled: true },
  { channel: "email", locale: "fr", subject: "FR {{order.code}}", body: "fr body", enabled: true },
];

describe("pickTemplate", () => {
  it("prefers the recipient locale", () => {
    expect(pickTemplate(rows as never, "email", "fr")?.subject).toBe("FR {{order.code}}");
  });
  it("falls back to en when locale missing", () => {
    expect(pickTemplate(rows as never, "email", "de" as never)?.subject).toBe("EN {{order.code}}");
  });
  it("returns null when channel has no template", () => {
    expect(pickTemplate(rows as never, "in_app", "en")).toBeNull();
  });
  it("skips a disabled matching row, falling back to en", () => {
    const disabled = [{ channel: "email", locale: "fr", subject: "x", body: "y", enabled: false }, ...rows];
    expect(pickTemplate(disabled as never, "email", "fr")?.subject).toBe("EN {{order.code}}");
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `pnpm --filter web exec vitest run lib/notifications/template-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement service + the pure picker**

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { renderEmailTemplate, renderInApp } from "./render-email";

type Channel = "email" | "in_app";
type Locale = "en" | "fr";
interface TemplateRow { channel: string; locale: string; subject: string; body: string; enabled: boolean }

/** Pure: choose the enabled row for channel, preferring `locale`, else `en`. */
export function pickTemplate(rows: TemplateRow[], channel: Channel, locale: Locale): { subject: string; body: string } | null {
  const enabled = rows.filter((r) => r.channel === channel && r.enabled);
  const exact = enabled.find((r) => r.locale === locale);
  const en = enabled.find((r) => r.locale === "en");
  const row = exact ?? en;
  return row ? { subject: row.subject, body: row.body } : null;
}

async function loadRows(event: string): Promise<TemplateRow[]> {
  return db
    .select({
      channel: notificationTemplate.channel,
      locale: notificationTemplate.locale,
      subject: notificationTemplate.subject,
      body: notificationTemplate.body,
      enabled: notificationTemplate.enabled,
    })
    .from(notificationTemplate)
    .where(eq(notificationTemplate.event, event as never));
}

/** Resolve + render the email body for an event/locale, or null if no template. */
export async function renderEmailForEvent(
  event: string, locale: Locale, vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const tpl = pickTemplate(await loadRows(event), "email", locale);
  return tpl ? renderEmailTemplate({ ...tpl, vars }) : null;
}

/** Resolve + render the in-app title/body for an event/locale, or null. */
export async function renderInAppForEvent(
  event: string, locale: Locale, vars: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> {
  const tpl = pickTemplate(await loadRows(event), "in_app", locale);
  return tpl ? renderInApp({ ...tpl, vars }) : null;
}
```

- [ ] **Step 4: Run → passes**

Run: `pnpm --filter web exec vitest run lib/notifications/template-service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/notifications/template-service.ts apps/web/lib/notifications/template-service.test.ts
git commit -m "feat(notify): template service with locale fallback"
```

---

## Task 8: Rewire drainer handlers + enqueue payload

**Files:**
- Modify: `apps/web/lib/notifications/handlers.ts`
- Modify: `apps/web/lib/notifications/enqueue.ts`
- Modify: `apps/web/lib/notifications/feed.ts` (recipient locale lookup helper)
- Delete: `apps/web/lib/notifications/templates.ts`

**Interfaces:**
- Consumes: `renderEmailForEvent`, `renderInAppForEvent` (Task 7); `EVENT_ENTITY` (Task 4).
- Produces: handlers that render from DB templates with a generic fallback. `enqueue` payload now carries `vars`.

- [ ] **Step 1: Update enqueue payload to carry `vars`**

In `enqueue.ts`, the `EnqueueInput` keeps `title`/`body`/`href` (used for the generic fallback) and adds optional `vars`. Change the payload built before insert:

```ts
  const payload = {
    title: input.title, body: input.body, href: input.href ?? null,
    vars: input.data ?? {},   // entity-field snapshot for templates
  };
```

(`data` is already on `EnqueueInput`; it now flows in as `vars`.)

- [ ] **Step 2: Rewire the email handler**

In `handlers.ts`, replace the email-handler body. It loads the recipient's locale, tries the DB template, and falls back to the generic branded render of `title`/`body`:

```ts
import { eq } from "drizzle-orm";
import { SesEmailProvider } from "@tiffin/commons-notify";
import { AppError } from "@tiffin/commons";
import { db } from "@/db/client";
import { notifications, notificationOutbox, users } from "@/db/schema";
import { renderEmailForEvent, renderInAppForEvent } from "./template-service";
import { renderEmailTemplate } from "./render-email";
import { broadcast } from "./broadcast";

type OutboxRow = typeof notificationOutbox.$inferSelect;
type Channel = (typeof notificationOutbox.channel.enumValues)[number];
export type ChannelHandler = (row: OutboxRow) => Promise<{ providerMessageId: string }>;

function payloadParts(row: OutboxRow) {
  const p = row.payload as { title?: string; body?: string; href?: string | null; vars?: Record<string, unknown> };
  return { title: p.title ?? "", body: p.body ?? "", href: p.href ?? null, vars: p.vars ?? {} };
}

function buildEmailHandler(): ChannelHandler {
  const provider = new SesEmailProvider({
    region: process.env.AWS_REGION,
    configurationSetName: process.env.SES_CONFIGURATION_SET,
    defaultFrom: {
      email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
      name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab",
    },
  });
  return async (row) => {
    const [user] = await db
      .select({ email: users.email, locale: users.locale })
      .from(users).where(eq(users.id, row.recipientId));
    if (!user?.email) throw new AppError(`Recipient ${row.recipientId} has no email`, 422);

    const { title, body, vars } = payloadParts(row);
    const rendered =
      (await renderEmailForEvent(row.event, user.locale, vars)) ??
      (await renderEmailTemplate({ subject: title, body, vars }));   // generic fallback

    return provider.send({ to: { email: user.email }, subject: rendered.subject, html: rendered.html, text: rendered.text });
  };
}
```

- [ ] **Step 3: Rewire the in-app handler**

```ts
const inApp: ChannelHandler = async (row) => {
  const { title, body, vars } = payloadParts(row);
  const [user] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, row.recipientId));
  const rendered = (await renderInAppForEvent(row.event, user?.locale ?? "en", vars)) ?? { title, body };
  const [n] = await db
    .insert(notifications)
    .values({ userId: row.recipientId, event: row.event, title: rendered.title, body: rendered.body, href: payloadParts(row).href })
    .returning({ publicId: notifications.publicId });
  await broadcast({ userId: row.recipientId, publicId: n.publicId, event: row.event, title: rendered.title, body: rendered.body, href: payloadParts(row).href });
  return { providerMessageId: n.publicId };
};

export function buildHandlers(): Record<Channel, ChannelHandler | undefined> {
  return { in_app: inApp, email: buildEmailHandler(), sms: undefined, whatsapp: undefined };
}
```

- [ ] **Step 4: Delete the old code templates**

```bash
git rm apps/web/lib/notifications/templates.ts
```

- [ ] **Step 5: Typecheck + run notification tests**

Run: `pnpm --filter web typecheck` → clean.
Run: `pnpm --filter web exec vitest run lib/notifications/policy.test.ts` → PASS (regression check; no templates.ts import remains).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/notifications
git commit -m "feat(notify): render from DB templates with generic fallback"
```

---

## Task 9: Seed default templates

**Files:**
- Create: `apps/web/db/seed-notification-templates.ts`
- Modify: `apps/web/package.json` (add `db:seed:notify` script)

**Interfaces:**
- Consumes: `notificationTemplate` schema. Produces seeded `en` rows for the main events (email + in_app). Idempotent (onConflictDoNothing on the unique key).

- [ ] **Step 1: Write the seed script**

```ts
import "dotenv/config";
import { db } from "./client";
import { notificationTemplate } from "./schema";

const SEED = [
  { event: "order_activated", channel: "email", locale: "en",
    subject: "Your Tiffin Grab order {{order.code}} is active",
    body: "# Welcome aboard, {{order.customerName}}!\n\nYour **{{order.planType}}** plan ({{order.code}}) is active. First delivery on {{order.startDate}}.\n\nTotal: {{order.total}}" },
  { event: "order_activated", channel: "in_app", locale: "en",
    subject: "Order {{order.code}} active", body: "Your {{order.planType}} plan starts {{order.startDate}}." },
  { event: "menu_released", channel: "email", locale: "en",
    subject: "This week's menu is live",
    body: "# This week's menu is ready\n\nPick your meals for the week starting **{{menuWeek.weekStartIso}}** before {{menuWeek.cutoffLabel}}." },
  { event: "menu_released", channel: "in_app", locale: "en",
    subject: "Menu live", body: "Pick meals for {{menuWeek.weekStartIso}} before {{menuWeek.cutoffLabel}}." },
  { event: "payment_received", channel: "email", locale: "en",
    subject: "Payment received", body: "We received your payment of **{{payment.amount}}** for order {{payment.orderCode}}." },
] as const;

async function main() {
  for (const t of SEED) {
    await db.insert(notificationTemplate).values(t as never).onConflictDoNothing({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
    });
  }
  console.log(`Seeded ${SEED.length} notification templates`);
  process.exit(0);
}
main();
```

- [ ] **Step 2: Add the script**

In `apps/web/package.json` scripts: `"db:seed:notify": "tsx db/seed-notification-templates.ts"`.

- [ ] **Step 3: Run + verify**

Run from `apps/web`: `set -a; . ./.env.local; set +a; pnpm exec tsx db/seed-notification-templates.ts`
Verify: `psql "$DATABASE_URL" -c "select event, channel, locale from notification_template order by 1"` shows the rows.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/seed-notification-templates.ts apps/web/package.json
git commit -m "feat(notify): seed default templates"
```

---

## Task 10: Template CRUD service + admin API

**Files:**
- Create: `apps/web/lib/services/notification-template.service.ts`
- Create: `apps/web/app/api/notifications/templates/route.ts`
- Create: `apps/web/app/api/notifications/templates/preview/route.ts`
- Create: `apps/web/app/api/notifications/templates/test/route.ts`
- Test: `apps/web/lib/services/__tests__/notification-template.service.test.ts`

**Interfaces:**
- Consumes: `notificationTemplate`, `validateTemplateVars` (Task 4), `renderEmailTemplate` (Task 6), `SesEmailProvider`, admin session helper.
- Produces:
  - `listTemplates(): Promise<TemplateRow[]>`
  - `upsertTemplate(input: { event; channel; locale; subject; body; enabled }): Promise<void>` (validates vars, throws `ValidationError` on unknown vars)
  - `sampleVars(event): Record<string, unknown>` (registry-driven placeholder data)
  - API: `GET/POST /api/notifications/templates`, `POST …/preview`, `POST …/test`.

- [ ] **Step 1: Write the failing service test**

```ts
import { describe, expect, it } from "vitest";
import { ValidationError } from "@tiffin/commons";
import { sampleVars, assertValidVars } from "@/lib/services/notification-template.service";

describe("notification-template.service", () => {
  it("builds sample vars from the registry", () => {
    expect(sampleVars("order_activated")).toHaveProperty("order.code" in {} ? "order" : "order");
    expect((sampleVars("order_activated") as { order: { code: string } }).order.code).toBeTypeOf("string");
  });
  it("rejects a body with unknown variables", () => {
    expect(() => assertValidVars("order_activated", "{{order.bogus}}")).toThrow(ValidationError);
  });
  it("accepts a body with only known variables", () => {
    expect(() => assertValidVars("order_activated", "{{order.code}}")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/notification-template.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the service**

```ts
import { ValidationError } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { EVENT_ENTITY, validateTemplateVars, type AppEvent } from "@/lib/notifications/event-entities";

export function assertValidVars(event: AppEvent, body: string): void {
  const unknown = validateTemplateVars(event, body);
  if (unknown.length) throw new ValidationError(`Unknown variables: ${unknown.join(", ")}`);
}

export function sampleVars(event: AppEvent): Record<string, unknown> {
  const e = EVENT_ENTITY[event];
  if (!e) return {};
  const obj: Record<string, string> = {};
  for (const f of e.fields) obj[f.name] = `<${f.label}>`;
  return { [e.entity]: obj };
}

export async function listTemplates() {
  return db.select().from(notificationTemplate);
}

export async function upsertTemplate(input: {
  event: AppEvent; channel: "email" | "in_app"; locale: "en" | "fr";
  subject: string; body: string; enabled: boolean;
}): Promise<void> {
  assertValidVars(input.event, input.body);
  assertValidVars(input.event, input.subject);
  await db
    .insert(notificationTemplate)
    .values(input as never)
    .onConflictDoUpdate({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
      set: { subject: input.subject, body: input.body, enabled: input.enabled },
    });
}
```

- [ ] **Step 4: Run → passes**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/notification-template.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the three API routes (admin-guarded)**

`apps/web/app/api/notifications/templates/route.ts`:

```ts
import { requireAdmin } from "@/lib/auth/guards";
import { listTemplates, upsertTemplate } from "@/lib/services/notification-template.service";

export async function GET(): Promise<Response> {
  await requireAdmin();
  return Response.json(await listTemplates());
}

export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  const body = await req.json();
  await upsertTemplate(body);
  return Response.json({ ok: true });
}
```

`apps/web/app/api/notifications/templates/preview/route.ts`:

```ts
import { requireAdmin } from "@/lib/auth/guards";
import { renderEmailTemplate } from "@/lib/notifications/render-email";
import { sampleVars } from "@/lib/services/notification-template.service";

export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  const { event, subject, body } = await req.json();
  const { html } = await renderEmailTemplate({ subject, body, vars: sampleVars(event) });
  return new Response(html, { headers: { "content-type": "text/html" } });
}
```

`apps/web/app/api/notifications/templates/test/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { SesEmailProvider } from "@tiffin/commons-notify";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { renderEmailTemplate } from "@/lib/notifications/render-email";
import { sampleVars } from "@/lib/services/notification-template.service";
import { getSession } from "@/lib/auth/session";

export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  const { event, subject, body } = await req.json();
  const publicId = (await getSession())?.user?.id;
  const [admin] = await db.select({ email: users.email }).from(users).where(eq(users.publicId, publicId!));
  if (!admin?.email) return new Response("admin has no email", { status: 422 });

  const provider = new SesEmailProvider({
    region: process.env.AWS_REGION,
    configurationSetName: process.env.SES_CONFIGURATION_SET,
    defaultFrom: { email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca", name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab" },
  });
  const rendered = await renderEmailTemplate({ subject, body, vars: sampleVars(event) });
  await provider.send({ to: { email: admin.email }, subject: `[TEST] ${rendered.subject}`, html: rendered.html, text: rendered.text });
  return Response.json({ sent: true });
}
```

> Verify `requireAdmin` exists at `@/lib/auth/guards` (the spec references "staff/admin pages self-guard (requireStaff/requireAdmin)"). If the export name differs, match it.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck` → clean.

```bash
git add apps/web/lib/services/notification-template.service.ts apps/web/lib/services/__tests__/notification-template.service.test.ts apps/web/app/api/notifications/templates
git commit -m "feat(notify): template CRUD service + admin API"
```

---

## Task 11: Admin settings UI

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/settings/notifications/page.tsx`
- Create: `apps/web/components/notifications/template-editor.tsx`
- Modify: `apps/web/package.json` (add `@uiw/react-md-editor`)
- Modify: `apps/web/components/dashboard/app-sidebar.tsx` (add Settings → Notifications link if the settings nav is enumerated there)

**Interfaces:**
- Consumes: `GET/POST /api/notifications/templates`, `…/preview`, `…/test`; `EVENT_ENTITY` + `availableVariables` (Task 4) for variable pills.
- Produces: admin UI to edit templates per event/channel/locale with preview + test-send.

- [ ] **Step 1: Add the editor dependency**

Edit `apps/web/package.json` dependencies: add `"@uiw/react-md-editor": "^4.0.0"`. Run `pnpm install`.

- [ ] **Step 2: Build the editor client component**

```tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface Props {
  event: string;
  variables: string[];                 // e.g. ["order.code", ...]
  initial: { channel: "email" | "in_app"; locale: "en" | "fr"; subject: string; body: string; enabled: boolean }[];
}

export function TemplateEditor({ event, variables, initial }: Props) {
  const [channel, setChannel] = useState<"email" | "in_app">("email");
  const [locale, setLocale] = useState<"en" | "fr">("en");
  const current = initial.find((t) => t.channel === channel && t.locale === locale);
  const [subject, setSubject] = useState(current?.subject ?? "");
  const [body, setBody] = useState(current?.body ?? "");
  const [enabled, setEnabled] = useState(current?.enabled ?? true);
  const [preview, setPreview] = useState<string>("");

  async function save() {
    const res = await fetch("/api/notifications/templates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, channel, locale, subject, body, enabled }),
    });
    toast[res.ok ? "success" : "error"](res.ok ? "Template saved" : "Save failed");
  }
  async function refreshPreview() {
    const res = await fetch("/api/notifications/templates/preview", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, subject, body }),
    });
    setPreview(await res.text());
  }
  async function sendTest() {
    const res = await fetch("/api/notifications/templates/test", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, subject, body }),
    });
    toast[res.ok ? "success" : "error"](res.ok ? "Test sent" : "Test failed");
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
          <TabsList><TabsTrigger value="email">Email</TabsTrigger><TabsTrigger value="in_app">In-app</TabsTrigger></TabsList>
        </Tabs>
        <Tabs value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
          <TabsList><TabsTrigger value="en">EN</TabsTrigger><TabsTrigger value="fr">FR</TabsTrigger></TabsList>
        </Tabs>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} /> Enabled
        </label>
      </div>

      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject / in-app title" />

      <div className="flex flex-wrap gap-1">
        {variables.map((v) => (
          <button key={v} type="button" className="rounded bg-muted px-2 py-0.5 text-xs"
            onClick={() => setBody((b) => `${b}{{${v}}}`)}>{`{{${v}}}`}</button>
        ))}
      </div>

      <div data-color-mode="light">
        <MDEditor value={body} onChange={(v) => setBody(v ?? "")} height={300} />
      </div>

      <div className="flex gap-2">
        <Button onClick={save}>Save</Button>
        <Button variant="outline" onClick={refreshPreview}>Preview</Button>
        <Button variant="outline" onClick={sendTest}>Send test</Button>
      </div>

      {preview && (
        <iframe title="preview" srcDoc={preview} className="h-96 w-full rounded border" />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build the settings page (server component)**

```tsx
import { requireAdmin } from "@/lib/auth/guards";
import { listTemplates } from "@/lib/services/notification-template.service";
import { EVENT_ENTITY, availableVariables, type AppEvent } from "@/lib/notifications/event-entities";
import { TemplateEditor } from "@/components/notifications/template-editor";

export default async function NotificationTemplatesPage() {
  await requireAdmin();
  const all = await listTemplates();
  const events = Object.keys(EVENT_ENTITY) as AppEvent[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Notification templates</h1>
        <p className="text-muted-foreground">Edit email + in-app templates per event and locale.</p>
      </div>
      {events.map((event) => (
        <section key={event} className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">{event}</h2>
          <TemplateEditor
            event={event}
            variables={availableVariables(event)}
            initial={all.filter((t) => t.event === event).map((t) => ({
              channel: t.channel as "email" | "in_app", locale: t.locale as "en" | "fr",
              subject: t.subject, body: t.body, enabled: t.enabled,
            }))}
          />
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add the nav link**

If `app-sidebar.tsx` enumerates settings sub-pages, add `{ title: "Notifications", url: "/dashboard/settings/notifications" }` to the Settings group (admin-only). Otherwise the route is reachable directly; skip.

- [ ] **Step 5: Typecheck + manual smoke**

Run: `pnpm --filter web typecheck` → clean.
Manual: start dev (`./node_modules/.bin/next dev` from `apps/web`), log in as admin (`admin@tiffingrab.ca` / `Admin123!`), open `/dashboard/settings/notifications`, edit a template, Preview (iframe renders), Save (toast), Send test (toast).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/settings/notifications apps/web/components/notifications/template-editor.tsx apps/web/package.json ../../pnpm-lock.yaml
git commit -m "feat(notify): admin template editor UI"
```

---

## Self-Review

**Spec coverage:**
- Unified `app_event` enum → Task 1. ✓
- Entity→variable registry → Task 4. ✓
- `notification_template` table → Task 3. ✓
- Localization (locale enum, users.locale, template key, fallback, editor tabs) → Tasks 2, 3, 7, 11. ✓
- Render pipeline (react-email Markdown, retire templates.ts, generic fallback, snapshot vars) → Tasks 6, 7, 8. ✓
- Variable interpolation → Task 5. ✓
- Admin UI (md editor, pills, preview, send-test, enable toggle) → Tasks 10, 11. ✓
- Seed defaults → Task 9. ✓
- Manual broadcast OUT OF SCOPE → not built; `event` stays NOT NULL (Task 3). ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code. Two explicit "verify the exact export/name" notes (react-email components in Task 6, `requireAdmin` in Task 10) — these are real verification steps against installed packages, not placeholders.

**Type consistency:** `AppEvent` from Task 4 used consistently; `pickTemplate`/`renderEmailForEvent`/`renderInAppForEvent` names match between Tasks 7 and 8; `renderEmailTemplate`/`renderInApp` signatures match between Tasks 6, 7, 8, 10; `sampleVars`/`assertValidVars` match between Tasks 10 and the routes.

**Risks flagged for the implementer:**
- Task 1 enum migration is the highest-risk mechanical step (rename + repoint wallet + notification columns). Apply against a backup-able dev DB; the live-DB test harness ([[live-db-test-harness]]) shares the seeded DB.
- react-email v6 export surface (Task 6) — confirm `Markdown`/`render` import paths before writing.
