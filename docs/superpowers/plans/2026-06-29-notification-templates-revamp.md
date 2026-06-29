# Notification Templates Settings Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked-accordion notification settings with a list+detail UX, list all events (incl. template-less), and swap the email editor from Markdown to `@react-email/editor` (real email-safe HTML), keeping Markdown for in-app.

**Architecture:** Email templates are authored in `@react-email/editor` (TipTap) and **exported at save** in the browser to `{html, text}`; the editor HTML is also stored in `body` so the template re-opens for editing. In-app keeps Markdown in `body`. The send path interpolates `{{vars}}` into the stored, pre-rendered strings — no editor or react-email render runs server-side. A server-rendered index lists every event with per-channel status; a `[event]` detail route mounts exactly one editor.

**Tech Stack:** `@react-email/editor` (MIT, TipTap), `@uiw/react-md-editor` (in-app), Drizzle + Postgres, Next 16 route handlers + server components, Vitest, shadcn.

## Global Constraints

- DB template is the **sole source of truth** — no template for an event+channel → that channel is skipped (unchanged behaviour).
- **Email** authored in `@react-email/editor`; **in-app** in Markdown. Editor choice branches by channel.
- Variables are literal `{{entity.field}}` text + our `interpolate()` applied **post-export** (no paid/dynamic-data tier).
- Email export happens **in the browser at save**; the send path only interpolates stored `html`/`text`.
- Index lists every `app_event` **except `manual_adjustment`**; status chips are **per channel** (locales on the detail page).
- All editor/render libraries must be free + OSS (MIT).
- Shared code → `@tiffin/commons*`; DB writes via the service layer; admin controls typed; epoch-ms timestamps.
- No Claude co-author trailer in commits. Work continues on branch `feat/notification-templates-events`.
- Run tooling via `PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/<bin>` (pnpm is off PATH; use `npx --yes pnpm@9.15.9 install` for installs). Load env with `set -a; . ./.env.local; set +a` before DB/test commands.

---

## File Structure

**Schema / migration**
- `apps/web/db/schema/notification-template.ts` — add `html`, `text`; relax `body` to nullable (modify).
- `apps/web/db/migrations/00NN_*` — generated (additive + nullable relax).
- `apps/web/db/seed-notification-templates.ts` — re-seed defaults in the new shape (modify).

**Render / service**
- `apps/web/lib/notifications/template-service.tsx` — email renders from stored `html`/`text`; `pickTemplate` returns the channel-appropriate fields (modify).
- `apps/web/lib/services/notification-template.service.ts` — `upsertTemplate` accepts the email shape + validates per channel (modify).

**UI**
- `apps/web/app/(dashboard)/dashboard/settings/notifications/page.tsx` — becomes the INDEX (rewrite).
- `apps/web/app/(dashboard)/dashboard/settings/notifications/[event]/page.tsx` — DETAIL (create).
- `apps/web/components/notifications/template-status.tsx` — index status chips + row (create).
- `apps/web/components/notifications/template-editor.tsx` — channel-aware; in-app MD path (modify).
- `apps/web/components/notifications/email-editor.tsx` — `@react-email/editor` wrapper, export-at-save, variable insertion (create).

---

## Task 1: Schema — email html/text columns

**Files:**
- Modify: `apps/web/db/schema/notification-template.ts`
- Create: migration via `db:generate`

**Interfaces:**
- Produces: `notificationTemplate` gains `html text` (nullable), `text text` (nullable); `body` becomes nullable. Consumed by Tasks 2, 3, 5.

- [ ] **Step 1: Edit the schema**

In `apps/web/db/schema/notification-template.ts`, change the `body` column and add two columns:

```ts
  subject: text("subject").notNull(),
  // in_app: markdown. email: the editor HTML (reload source for re-editing).
  body: text("body"),
  // email only: exported email-safe HTML + plaintext (pre-interpolation).
  html: text("html"),
  text: text("text"),
  enabled: boolean("enabled").notNull().default(true),
```

- [ ] **Step 2: Generate + apply migration**

Run from `apps/web`:
```
PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/drizzle-kit generate --name template_email_html
set -a; . ./.env.local; set +a
PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/drizzle-kit migrate
```
Expected: adds `html`, `text` columns; drops NOT NULL on `body`.

- [ ] **Step 3: Verify + commit**

Verify:
```
node -e 'const p=require("postgres")(process.env.DATABASE_URL);(async()=>{const c=await p`select column_name,is_nullable from information_schema.columns where table_name=${"notification_template"} and column_name in (${"body"},${"html"},${"text"})`;console.log(c);await p.end()})()'
```
Expected: `body` is_nullable YES; `html`,`text` present nullable.

```bash
git add apps/web/db/schema/notification-template.ts apps/web/db/migrations
git commit -m "feat(notify): template html/text columns; body nullable"
```

---

## Task 2: Service + render for the email shape

**Files:**
- Modify: `apps/web/lib/services/notification-template.service.ts`
- Modify: `apps/web/lib/notifications/template-service.tsx`
- Modify: `apps/web/lib/services/__tests__/notification-template.service.test.ts`

**Interfaces:**
- Consumes: `interpolate` (existing), `notificationTemplate`, `validateTemplateVars`.
- Produces:
  - `upsertTemplate(input)` where input is `{ event, channel: "email", locale, subject, body, html, text, enabled }` OR `{ event, channel: "in_app", locale, subject, body, enabled }`. Validates channel-required fields + variables.
  - `renderEmailForEvent(event, locale, vars): Promise<{subject, html, text} | null>` now interpolates the **stored** `html`/`text` (not react-email).
  - `renderInAppForEvent(event, locale, vars)` unchanged (interpolates `body`).

- [ ] **Step 1: Write the failing service test**

Append to `notification-template.service.test.ts`:

```ts
import { upsertTemplate } from "@/lib/services/notification-template.service";

describe("upsertTemplate validation", () => {
  it("rejects an email template missing html", async () => {
    await expect(
      upsertTemplate({ event: "order_activated", channel: "email", locale: "en", subject: "s", body: "<p>x</p>", html: "", text: "t", enabled: true } as never),
    ).rejects.toThrow();
  });
  it("rejects an in_app template missing body", async () => {
    await expect(
      upsertTemplate({ event: "order_activated", channel: "in_app", locale: "en", subject: "s", body: "", enabled: true } as never),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run → fails**

Run: `set -a; . ./.env.local; set +a; PATH="/opt/homebrew/bin:$PATH" ../../node_modules/.bin/vitest run lib/services/__tests__/notification-template.service.test.ts`
Expected: FAIL (current `upsertTemplate` has no channel-shape validation).

- [ ] **Step 3: Update the service**

Replace `upsertTemplate` in `notification-template.service.ts`:

```ts
import { ValidationError } from "@tiffin/commons";

type EmailInput = { event: AppEvent; channel: "email"; locale: "en" | "fr"; subject: string; body: string; html: string; text: string; enabled: boolean };
type InAppInput = { event: AppEvent; channel: "in_app"; locale: "en" | "fr"; subject: string; body: string; enabled: boolean };
export type UpsertInput = EmailInput | InAppInput;

export async function upsertTemplate(input: UpsertInput): Promise<void> {
  assertValidVars(input.event, input.subject);
  if (input.channel === "email") {
    if (!input.html || !input.text || !input.body) throw new ValidationError("Email template needs body, html and text");
  } else {
    if (!input.body) throw new ValidationError("In-app template needs a body");
    assertValidVars(input.event, input.body);
  }
  const values =
    input.channel === "email"
      ? { event: input.event, channel: input.channel, locale: input.locale, subject: input.subject, body: input.body, html: input.html, text: input.text, enabled: input.enabled }
      : { event: input.event, channel: input.channel, locale: input.locale, subject: input.subject, body: input.body, html: null, text: null, enabled: input.enabled };
  await db
    .insert(notificationTemplate)
    .values(values)
    .onConflictDoUpdate({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
      set: { subject: values.subject, body: values.body, html: values.html, text: values.text, enabled: values.enabled },
    });
}
```

- [ ] **Step 4: Update email render to use stored html/text**

In `template-service.tsx`, replace `renderEmailForEvent` and the `pickTemplate`/`loadRows` selections to carry `html`/`text`:

```ts
import { interpolate } from "./interpolate";

interface TemplateRow { channel: string; locale: string; subject: string; body: string | null; html: string | null; text: string | null; enabled: boolean }

export function pickTemplate(rows: TemplateRow[], channel: string, locale: string): TemplateRow | null {
  const enabled = rows.filter((r) => r.channel === channel && r.enabled);
  return enabled.find((r) => r.locale === locale) ?? enabled.find((r) => r.locale === "en") ?? null;
}

async function loadRows(event: string): Promise<TemplateRow[]> {
  return db.select({
    channel: notificationTemplate.channel, locale: notificationTemplate.locale,
    subject: notificationTemplate.subject, body: notificationTemplate.body,
    html: notificationTemplate.html, text: notificationTemplate.text, enabled: notificationTemplate.enabled,
  }).from(notificationTemplate).where(eq(notificationTemplate.event, event as never));
}

export async function renderEmailForEvent(event: string, locale: Locale, vars: Record<string, unknown>): Promise<{ subject: string; html: string; text: string } | null> {
  const t = pickTemplate(await loadRows(event), "email", locale);
  if (!t || !t.html || !t.text) return null;
  return { subject: interpolate(t.subject, vars), html: interpolate(t.html, vars), text: interpolate(t.text, vars) };
}

export async function renderInAppForEvent(event: string, locale: Locale, vars: Record<string, unknown>): Promise<{ title: string; body: string } | null> {
  const t = pickTemplate(await loadRows(event), "in_app", locale);
  if (!t || !t.body) return null;
  return { title: interpolate(t.subject, vars), body: interpolate(t.body, vars) };
}
```

Remove the now-unused `render-email`/`renderInApp` imports from this file (email no longer renders markdown here).

- [ ] **Step 5: Fix the existing pickTemplate test**

The old test asserted `pickTemplate(...)?.subject`; the return is now the full row, so `.subject` still works. Update the `template-service.test.ts` row literals to include `body/html/text` fields:

```ts
const rows = [
  { channel: "email", locale: "en", subject: "EN {{order.code}}", body: "<p>en</p>", html: "<p>en</p>", text: "en", enabled: true },
  { channel: "email", locale: "fr", subject: "FR {{order.code}}", body: "<p>fr</p>", html: "<p>fr</p>", text: "fr", enabled: true },
];
```

(Disabled-row test: same shape with `enabled:false`.)

- [ ] **Step 6: Run tests + typecheck**

Run: `set -a; . ./.env.local; set +a; PATH="/opt/homebrew/bin:$PATH" ../../node_modules/.bin/vitest run lib/notifications/template-service.test.ts lib/services/__tests__/notification-template.service.test.ts`
Expected: PASS.
Run: `PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/notifications/template-service.tsx apps/web/lib/services/notification-template.service.ts apps/web/lib/services/__tests__/notification-template.service.test.ts apps/web/lib/notifications/template-service.test.ts
git commit -m "feat(notify): email renders from stored html/text; channel-shaped upsert"
```

---

## Task 3: Re-seed defaults in the new shape

**Files:**
- Modify: `apps/web/db/seed-notification-templates.ts`

**Interfaces:**
- Consumes: `notificationTemplate`. Produces: email seed rows carry `body`/`html`/`text`; in_app rows carry `body`. Idempotent on conflict (now `onConflictDoUpdate` so legacy markdown email rows get the new columns).

- [ ] **Step 1: Update the seed**

For each email row, provide minimal hand-written `html`/`text` (the admin will refine in the editor). Example for `order_activated`:

```ts
{
  event: "order_activated", channel: "email", locale: "en",
  subject: "Your Tiffin Grab order {{order.code}} is active",
  body: "<h1>Welcome aboard, {{order.customerName}}!</h1><p>Your {{order.planType}} plan ({{order.code}}) is active. First delivery on {{order.startDate}}. Total: {{order.total}}.</p>",
  html: "<h1>Welcome aboard, {{order.customerName}}!</h1><p>Your {{order.planType}} plan ({{order.code}}) is active. First delivery on {{order.startDate}}. Total: {{order.total}}.</p>",
  text: "Welcome aboard, {{order.customerName}}! Your {{order.planType}} plan ({{order.code}}) is active. First delivery on {{order.startDate}}. Total: {{order.total}}.",
},
```

In-app rows stay `{ subject, body }` (markdown). Change the seed's conflict handler to update:

```ts
await db.insert(notificationTemplate).values(t).onConflictDoUpdate({
  target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
  set: { subject: t.subject, body: t.body ?? null, html: t.html ?? null, text: t.text ?? null },
});
```

- [ ] **Step 2: Run + verify + commit**

Run: `set -a; . ./.env.local; set +a; PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/tsx db/seed-notification-templates.ts`
Verify: `node -e 'const p=require("postgres")(process.env.DATABASE_URL);(async()=>{const r=await p`select event,channel,(html is not null) has_html from notification_template where channel=${"email"}`;console.log(r);await p.end()})()'` → email rows have `has_html=true`.

```bash
git add apps/web/db/seed-notification-templates.ts
git commit -m "feat(notify): seed email templates with html/text"
```

---

## Task 4: Index page + status chips

**Files:**
- Create: `apps/web/components/notifications/template-status.tsx`
- Rewrite: `apps/web/app/(dashboard)/dashboard/settings/notifications/page.tsx`

**Interfaces:**
- Consumes: `listTemplates`, `appEvent` enum, `requireAdmin`.
- Produces: a server-rendered index listing all events (except `manual_adjustment`) with per-channel chips; rows link to `/dashboard/settings/notifications/[event]`.

- [ ] **Step 1: Status chip component**

```tsx
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary/30 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>
      <span className={`size-1.5 rounded-full ${on ? "bg-primary" : "bg-muted-foreground/40"}`} />
      {label}
    </span>
  );
}

export function TemplateRow({ event, email, inApp }: { event: string; email: boolean; inApp: boolean }) {
  return (
    <Link href={`/dashboard/settings/notifications/${event}`}
      className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-accent">
      <span className="font-medium">{event}</span>
      <span className="ml-auto flex items-center gap-2">
        <Chip label="Email" on={email} />
        <Chip label="In-app" on={inApp} />
        <ArrowRightIcon className="size-4 text-muted-foreground" />
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Rewrite the index page**

```tsx
import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { TemplateRow } from "@/components/notifications/template-status";

export default async function NotificationTemplatesPage() {
  await requireAdmin();
  const all = await listTemplates();
  const has = (event: string, channel: string) =>
    all.some((t) => t.event === event && t.channel === channel && t.enabled);
  const events = appEvent.enumValues.filter((e) => e !== "manual_adjustment");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification templates</h1>
        <p className="text-muted-foreground">A channel with no template does not send. Click an event to edit.</p>
      </div>
      <div className="grid gap-2">
        {events.map((event) => (
          <TemplateRow key={event} event={event} email={has(event, "email")} inApp={has(event, "in_app")} />
        ))}
      </div>
    </div>
  );
}
```

(Search is added in the polish task; the list is short enough to ship without it first.)

- [ ] **Step 3: Typecheck + manual + commit**

Run: `PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` → exit 0.
Manual: start dev, open `/dashboard/settings/notifications` → all events listed, chips reflect seeded state, rows link out.

```bash
git add apps/web/components/notifications/template-status.tsx "apps/web/app/(dashboard)/dashboard/settings/notifications/page.tsx"
git commit -m "feat(notify): templates index with per-channel status chips"
```

---

## Task 5: Email editor component

**Files:**
- Create: `apps/web/components/notifications/email-editor.tsx`
- Modify: `apps/web/package.json` (add `@react-email/editor`)

**Interfaces:**
- Produces: `EmailEditorField` — a client component wrapping `@react-email/editor` with: initial `content`, a variable-pill row that inserts literal `{{var}}` text, and an imperative `exportEmail()` returning `{ html, text, body }` (`body` = `getHTML()` reload source). Consumed by Task 6.

- [ ] **Step 1: Add the dependency**

Edit `apps/web/package.json` dependencies: add `"@react-email/editor": "^1.0.0"` (use the version `npm view @react-email/editor version` reports). Run `PATH="/opt/homebrew/bin:$PATH" npx --yes pnpm@9.15.9 install`.

- [ ] **Step 2: Verify the export surface**

```
node -e "const m=require('@react-email/editor'); console.log(Object.keys(m))"
node -e "console.log(require('@react-email/editor/package.json').exports ? 'has exports' : 'no exports')"
```
Expected: `EmailEditor` present. Confirm the CSS path `@react-email/editor/themes/default.css` resolves (the package `exports` lists a `./themes/default.css`). If the path differs, use the listed one.

- [ ] **Step 3: Build the wrapper**

```tsx
"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { EmailEditor, type EmailEditorRef } from "@react-email/editor";
import "@react-email/editor/themes/default.css";

export interface EmailEditorFieldHandle {
  exportEmail: () => Promise<{ html: string; text: string; body: string }>;
}

interface Props {
  initialHtml: string;
  variables: string[];
}

export const EmailEditorField = forwardRef<EmailEditorFieldHandle, Props>(function EmailEditorField(
  { initialHtml, variables },
  ref,
) {
  const editorRef = useRef<EmailEditorRef>(null);

  useImperativeHandle(ref, () => ({
    async exportEmail() {
      const { html, text } = await editorRef.current!.export();
      const body = editorRef.current!.getHTML();
      return { html, text, body };
    },
  }));

  const insertVar = (v: string) => {
    // TipTap chain: insert the literal {{var}} as text at the cursor.
    editorRef.current?.editor?.chain().focus().insertContent(`{{${v}}}`).run();
  };

  return (
    <div className="space-y-2">
      {variables.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {variables.map((v) => (
            <button key={v} type="button" className="rounded bg-muted px-2 py-0.5 font-mono text-xs hover:bg-accent" onClick={() => insertVar(v)}>
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}
      <div className="rounded border">
        <EmailEditor ref={editorRef} content={initialHtml || "<p></p>"} theme="basic" />
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Typecheck + commit**

Run: `PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` → exit 0.

```bash
git add apps/web/components/notifications/email-editor.tsx apps/web/package.json ../../pnpm-lock.yaml
git commit -m "feat(notify): @react-email/editor wrapper with variable insertion"
```

---

## Task 6: Detail page + channel-aware editor

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/settings/notifications/[event]/page.tsx`
- Modify: `apps/web/components/notifications/template-editor.tsx`

**Interfaces:**
- Consumes: `EmailEditorField` (Task 5), the MD editor (existing), `availableVariables`, the 3 API routes. Produces: a focused per-event editor: email tab uses `EmailEditorField` + export-at-save; in-app tab uses MD; locale tabs; subject; preview; enable; Save; Send test.

- [ ] **Step 1: Detail page (server)**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { availableVariables, type AppEvent } from "@/lib/notifications/event-entities";
import { TemplateEditor } from "@/components/notifications/template-editor";

export default async function Page({ params }: { params: Promise<{ event: string }> }) {
  await requireAdmin();
  const { event } = await params;
  if (!appEvent.enumValues.includes(event as AppEvent) || event === "manual_adjustment") notFound();

  const all = await listTemplates();
  const initial = all.filter((t) => t.event === event).map((t) => ({
    channel: t.channel as "email" | "in_app", locale: t.locale as "en" | "fr",
    subject: t.subject, body: t.body ?? "", html: t.html ?? "", text: t.text ?? "", enabled: t.enabled,
  }));

  return (
    <div className="space-y-6">
      <Link href="/dashboard/settings/notifications" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All templates
      </Link>
      <h1 className="text-2xl font-semibold">{event}</h1>
      <TemplateEditor event={event} variables={availableVariables(event as AppEvent)} initial={initial} />
    </div>
  );
}
```

- [ ] **Step 2: Make `TemplateEditor` channel-aware**

Rewrite `template-editor.tsx`: keep the in-app MD path; for email mount `EmailEditorField` and, on Save, call its `exportEmail()` to get `{html,text,body}`. The initial row now carries `html`/`text`.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import "@uiw/react-md-editor/markdown-editor.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailEditorField, type EmailEditorFieldHandle } from "./email-editor";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Channel = "email" | "in_app";
type Locale = "en" | "fr";
interface Row { channel: Channel; locale: Locale; subject: string; body: string; html: string; text: string; enabled: boolean }

export function TemplateEditor({ event, variables, initial }: { event: string; variables: string[]; initial: Row[] }) {
  const [channel, setChannel] = useState<Channel>("email");
  const [locale, setLocale] = useState<Locale>("en");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<EmailEditorFieldHandle>(null);

  useEffect(() => {
    const row = initial.find((t) => t.channel === channel && t.locale === locale);
    setSubject(row?.subject ?? "");
    setBody(row?.body ?? "");
    setEmailHtml(row?.body ?? ""); // email reload source is stored in body
    setEnabled(row?.enabled ?? true);
    setPreview("");
  }, [channel, locale, initial]);

  async function save() {
    setBusy(true);
    let payload: Record<string, unknown> = { event, channel, locale, subject, enabled };
    if (channel === "email") {
      const out = await emailRef.current!.exportEmail();
      payload = { ...payload, body: out.body, html: out.html, text: out.text };
    } else {
      payload = { ...payload, body };
    }
    const res = await fetch("/api/notifications/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    toast[res.ok ? "success" : "error"](res.ok ? "Template saved" : "Save failed");
  }

  async function preview_() {
    if (channel === "email") {
      const out = await emailRef.current!.exportEmail();
      setPreview(out.html);
    } else {
      setPreview(`<pre style="font-family:system-ui;padding:16px">${body}</pre>`);
    }
  }

  async function sendTest() {
    if (channel !== "email") { toast.error("Test send is email only"); return; }
    setBusy(true);
    const out = await emailRef.current!.exportEmail();
    const res = await fetch("/api/notifications/templates/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, subject, html: out.html, text: out.text }) });
    setBusy(false);
    toast[res.ok ? "success" : "error"](res.ok ? "Test sent" : "Test failed");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <TabsList><TabsTrigger value="email">Email</TabsTrigger><TabsTrigger value="in_app">In-app</TabsTrigger></TabsList>
        </Tabs>
        <Tabs value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          <TabsList><TabsTrigger value="en">EN</TabsTrigger><TabsTrigger value="fr">FR</TabsTrigger></TabsList>
        </Tabs>
        <label className="ml-auto flex items-center gap-2 text-sm"><Switch checked={enabled} onCheckedChange={setEnabled} /> Enabled</label>
      </div>

      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject / in-app title" />

      {channel === "email" ? (
        <EmailEditorField key={`${channel}-${locale}`} ref={emailRef} initialHtml={emailHtml} variables={variables} />
      ) : (
        <>
          {variables.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {variables.map((v) => (
                <button key={v} type="button" className="rounded bg-muted px-2 py-0.5 font-mono text-xs hover:bg-accent" onClick={() => setBody((b) => `${b}{{${v}}}`)}>{`{{${v}}}`}</button>
              ))}
            </div>
          )}
          <div data-color-mode="light"><MDEditor value={body} onChange={(v) => setBody(v ?? "")} height={280} /></div>
        </>
      )}

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>Save</Button>
        <Button variant="outline" onClick={preview_} disabled={busy}>Preview</Button>
        {channel === "email" && <Button variant="outline" onClick={sendTest} disabled={busy}>Send test</Button>}
      </div>

      {preview && <iframe title="preview" srcDoc={preview} className="h-96 w-full rounded border" />}
    </div>
  );
}
```

- [ ] **Step 3: Update the test route to accept rendered html/text**

In `apps/web/app/api/notifications/templates/test/route.ts`, change the body parse + send to take `html`/`text` directly (the editor exports client-side; no server render):

```ts
  const { subject, html, text } = await req.json();
  // … resolve admin email …
  const rendered = { subject, html, text };
  await provider.send({ to: { email: admin.email }, subject: `[TEST] ${subject}`, html, text });
```

Drop the `renderEmailTemplate`/`sampleVars` imports there if now unused.

- [ ] **Step 4: Typecheck + manual smoke + commit**

Run: `PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` → exit 0.
Manual: open an event detail; Email tab shows the react-email editor with the seeded content; insert a variable pill (literal `{{…}}` appears); Save (toast); Preview (iframe shows email HTML); switch to In-app (MD editor); Save. Confirm console has no module/CSS errors.

```bash
git add "apps/web/app/(dashboard)/dashboard/settings/notifications/[event]/page.tsx" apps/web/components/notifications/template-editor.tsx apps/web/app/api/notifications/templates/test/route.ts
git commit -m "feat(notify): per-event detail page; channel-aware editor (react-email + MD)"
```

---

## Task 7: Polish pass + index search

**Files:**
- Modify: `apps/web/components/notifications/template-status.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/settings/notifications/page.tsx`
- Modify: `apps/web/components/notifications/template-editor.tsx`

**Interfaces:** No new exports; refine existing per `impeccable` + `make-interfaces-feel-better`.

- [ ] **Step 1: Apply the design skills**

Invoke the `impeccable` and `make-interfaces-feel-better` skills and apply their guidance to the index + detail. Concretely:
- Index: add a client search box filtering rows by event name; group rows with calm vertical rhythm; ensure chips have consistent width + accessible contrast; add an empty-search state.
- Rows: refine hover/active (subtle elevation or bg), optical alignment of chips + chevron, focus-visible ring for keyboard nav.
- Detail: spacing rhythm around tabs/subject/editor/actions; sticky action bar if the editor is tall; clear "unsaved changes" affordance is out of scope (note only).
- Use existing design tokens (`text-muted-foreground`, `border`, `bg-accent`) — no new color values, per [[no-text-effects]].

- [ ] **Step 2: Add index search (client island)**

Convert the event list to a small client component that filters by a controlled input; keep `requireAdmin` + data load on the server, pass the event+status array as props.

- [ ] **Step 3: Typecheck + manual + commit**

Run: `PATH="/opt/homebrew/bin:$PATH" ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` → exit 0.
Manual: index search filters; keyboard tab/focus visible; detail spacing reads cleanly.

```bash
git add apps/web/components/notifications apps/web/app/\(dashboard\)/dashboard/settings/notifications
git commit -m "feat(notify): polish templates index + detail (search, chips, spacing, a11y)"
```

---

## Self-Review

**Spec coverage:**
- Editor per channel (email = @react-email/editor, in-app = MD) → Tasks 5, 6. ✓
- Variables as literal text + interpolate post-export → Tasks 2 (render), 5/6 (insertion). ✓
- Export-at-save → `{html,text}` stored; send interpolates stored strings → Tasks 2, 6. ✓
- Schema (`html`/`text` add, `body` nullable) → Task 1. ✓
- Index list of all events except `manual_adjustment`, per-channel chips → Task 4. ✓
- Detail `[event]` page → Task 6. ✓
- Re-seed defaults in new shape → Task 3. ✓
- Polish via impeccable + make-interfaces-feel-better → Task 7. ✓
- No-template-skip unchanged; DB source of truth → preserved (Task 2 render returns null when html/text missing). ✓

**Placeholder scan:** No TBD/TODO. Two real verification steps remain (Task 5 Step 2: confirm `@react-email/editor` export + CSS path against the installed package; version via `npm view`). These are package-surface checks, not placeholders.

**Type consistency:** `Row`/`initial` shape carries `body/html/text/subject/enabled` consistently across Tasks 4/6; `UpsertInput` union (Task 2) matches the payloads built in Task 6's `save()`; `EmailEditorFieldHandle.exportEmail(): {html,text,body}` matches its use in Task 6; `renderEmailForEvent` returns `{subject,html,text}|null` consistent with the Task 2 handler (handlers from the prior plan already consume it).

**Risks flagged:**
- `@react-email/editor` is young — verify SSR-safety in a Next client component (it's client-only; mount under `"use client"`, no dynamic import needed unless it touches `window` at import time — if it does, wrap with `next/dynamic({ ssr:false })`).
- `editor.chain().insertContent("{{var}}")` assumes the TipTap instance is exposed via `ref.editor`; confirmed in the API table (`editor: Editor | null`).
- The previously-built `handlers.ts` email path calls `renderEmailForEvent` — its return contract is unchanged (`{subject,html,text}|null`), so no handler edit is needed.
