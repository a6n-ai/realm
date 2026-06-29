# Notification Templates Settings Revamp — Design

**Date:** 2026-06-29
**Status:** Design approved, pre-implementation
**Builds on:** `2026-06-29-notification-templates-events-design.md` (event-bound
templates, render pipeline, admin editor). This spec **revamps the editing UX**
and **swaps the email editor** from Markdown to a real email editor.
**Out of scope:** notification campaigns (separate Spec B).

---

## 1. Goals

1. Replace the single stacked-accordion settings page with a **list + detail**
   structure: an index that scans all events with status, and a focused
   per-event editor page.
2. List **all** notification events — including ones with no template yet — so
   admins can add templates to any event.
3. Use the **right editor per channel**: a real email editor for email
   (Markdown is wrong for email layout), Markdown for in-app.
4. Polished, intentional UI via the `impeccable` + `make-interfaces-feel-better`
   principles.

---

## 2. Editor per channel

Markdown cannot express the columns, buttons, spacing, and table-based layout
email clients require — it is right for in-app (short rich text) only.

| Channel | Editor | Stored | Rendered |
|---------|--------|--------|----------|
| email   | `@react-email/editor` (MIT, TipTap/ProseMirror; rich text, slash commands, multi-column; exports email-safe HTML + plaintext) | `doc` (editor JSON, re-editable) + `html` + `text` | `interpolate(html/text, vars)` → SES |
| in_app  | `@uiw/react-md-editor` (current) | `body` (Markdown) | `interpolate(markdown, vars)` → title/plaintext |

- **Variables:** the admin inserts `{{entity.field}}` as **literal text** via
  variable pills. Substitution stays in our existing `interpolate()`, applied
  **after** the editor's HTML/text export. The OSS editor needs no dynamic-data
  feature.
- **Export-at-save:** when an email template is saved, the browser exports the
  editor doc to `html` + `text` and persists all three (`doc`, `html`, `text`).
  The send path (drainer/Lambda) only interpolates pre-rendered strings — no
  editor code runs server-side.

### Render pipeline change
- Email: `renderEmailForEvent` returns the stored `html`/`text` (locale-resolved)
  → `interpolate(vars)` → SES. The react-email `<Markdown>` email render is
  retired; `render-email.tsx` keeps the in-app path only (or is replaced by a
  small interpolation helper).
- In-app: unchanged (markdown → interpolate → title/plaintext).
- No-template-skip behaviour (DB is source of truth) is unchanged.

---

## 3. Schema

`notification_template` gains email-doc columns; in-app keeps `body`.

```
notification_template
  ...existing (event, channel, locale, subject, enabled, unique key)
  body  text  NULL   -- in_app: markdown (was NOT NULL → relax to NULL)
  doc   jsonb NULL   -- email: @react-email/editor document (re-editable)
  html  text  NULL   -- email: exported, email-safe HTML (pre-interpolation)
  text  text  NULL   -- email: exported plaintext (pre-interpolation)
```

- email rows use `doc`/`html`/`text`; in_app rows use `body`. A row is valid
  when its channel's columns are present (enforced in the service, not a DB
  constraint).
- Migration: add `doc`/`html`/`text` (nullable), relax `body` to nullable.
- Existing seeded markdown email rows: either re-seed via the editor or treat as
  legacy until edited. Seed updated to author email rows through the new shape
  (a minimal exported HTML/text for the defaults).

---

## 4. UI — list + detail

### Index — `/dashboard/settings/notifications`
Server-rendered; **zero editors mounted** (fixes the ~17-editor first-paint lag).

```
Notification templates                              [search…]
──────────────────────────────────────────────────────────────
 order_activated     ● Email    ● In-app                    →
 order_created       ○ Email    ● In-app                    →
 menu_released       ● Email    ● In-app                    →
 ticket_resolved     ○ Email    ○ In-app                    →
 … all app events except manual_adjustment …
──────────────────────────────────────────────────────────────
   ● enabled template present     ○ none — add
```

- One row per event (all `app_event` except `manual_adjustment`).
- Status **chips per channel** (email / in_app): present-and-enabled vs none.
  Locale breakdown lives on the detail page.
- Searchable by event name.
- Row → detail page.

### Detail — `/dashboard/settings/notifications/[event]`
Focused editor; exactly one editor mounts.

- Back link to index.
- Channel tabs (Email / In-app) + locale tabs (EN / FR).
- Subject field.
- Variable pills from `EVENT_ENTITY` (none for events without an entity).
- Channel-appropriate editor: `@react-email/editor` (email) or MD (in-app).
- Live preview (iframe) — email uses exported HTML; in-app a simple render.
- Enable toggle, Save, Send test.

### Polish (`impeccable` + `make-interfaces-feel-better`)
Applied during implementation: status chips with clear affordance, calm
spacing/rhythm, optical alignment, explicit empty states ("No template — add
one"), subtle row hover/active, tabular consistency, accessible focus states.

---

## 5. Reuse vs new

- **Reuse:** `EVENT_ENTITY`/`availableVariables`, `interpolate`, the 3 API routes
  (extended), `listTemplates`, `upsertTemplate` (extended for email shape),
  `notification_template` table, the send/drainer pipeline.
- **New:** index page, `[event]` detail page, status-chip component, email
  editor wrapper around `@react-email/editor`, export-at-save wiring, schema
  columns + migration.
- **Changed:** `TemplateEditor` splits into a channel-aware editor (email vs MD);
  email render reads stored `html`/`text` instead of markdown.

---

## 6. Data flow

```
admin (email)  → @react-email/editor → export → {doc, html, text}
               → POST /templates (subject, channel=email, locale, doc, html, text, enabled)
admin (in_app) → MD editor → POST /templates (subject, channel=in_app, locale, body, enabled)

send: enqueue(event, vars) → outbox → drainer
   email:  load template(event, email, locale) → interpolate(html/text, vars) → SES
   in_app: load template(event, in_app, locale) → interpolate(markdown, vars) → title/plaintext
   no template → skip (unchanged)
```

---

## 7. Testing

- `interpolate` already covered.
- Service: validate email rows require `doc`/`html`/`text`, in_app requires
  `body`; var validation runs against `subject` + the text content.
- `pickTemplate` locale fallback already covered (extend for email shape).
- Manual smoke: index renders all events with correct chips; detail email editor
  mounts + exports + preview; in-app MD path unchanged; send uses stored HTML.

---

## 8. Scope / YAGNI

Deferred: campaigns (Spec B), `@react-email/editor` dynamic-data/LiquidJS tier
(we interpolate ourselves), per-locale chips on the index, template versioning,
A/B variants.

---

## 9. Open implementation notes

- Confirm `@react-email/editor` package name/version, license (MIT, Resend), and
  the headless/browser export API (`@react-email/editor/utils` or equivalent)
  before wiring; verify it runs in a Next client component.
- Variable insertion into the email editor (literal `{{…}}` text node).
- Email preview reuses exported HTML + `interpolate(sampleVars)`.
- `body` relax-to-nullable migration; back-compat for the 7 seeded markdown
  email rows (re-seed through the new shape).
