# Notification Templates, Events & Localization — Design

**Date:** 2026-06-29
**Status:** Design approved, pre-implementation
**Builds on:** `2026-06-29-notification-system-design.md` (channels, outbox, drainer,
SES, AppSync, bell). This spec adds admin-editable, localized, event-driven
templates and a unified app-event model.

---

## 1. Goal

Admins author notification templates per event, per channel (email, in-app),
per locale, in a settings UI. Templates render from Markdown through react-email
into branded HTML, with variables drawn from the event's entity (direct DB
columns). **The DB template is the single source of truth** — if no template
exists for an event+channel, that channel is NOT delivered (the send is skipped
and recorded). No code/generic fallback.

Manual broadcast (event-less templates sent to admin-built user lists) is **out
of scope** here — captured as a follow-up plan in §10.

---

## 2. Unified `app_event` enum

One app-wide event enum replaces BOTH wallet's `business_event` and the
`notification_event` shipped in the prior spec. Single source of truth; wallet
`event_payout` and `notification_template` both reference it.

```
order_created, order_activated, order_completed, order_cancelled, order_paused,
payment_received, refund_issued,
menu_released,
wallet_credited, wallet_redeemed,
inquiry_created, inquiry_follow_up, inquiry_converted,
ticket_created, ticket_reply, ticket_resolved,
signup, manual_adjustment
```

- An event needs neither a payout nor a template — each subsystem uses the
  subset that applies. `manual_adjustment` is wallet-only (no template).
- **Migration:** rename `business_event` → `app_event`, add the new values;
  migrate `notification_outbox.event`, `notifications.event`, and
  `event_payout.event_type` / `wallet_ledger.event_type` to `app_event`. Nothing
  is in production, so this is a clean refactor. The prior spec's
  `notification_event` enum is removed.

---

## 3. Entity → variable registry (code, not DB)

Each event maps to one entity and a whitelist of DB columns exposed as template
variables. Lives in code (`apps/web/lib/notifications/event-entities.ts`):

```ts
export const EVENT_ENTITY: Record<AppEvent, EntityVars | null> = {
  order_activated: { entity: "order", fields: [
    { name: "code", label: "Order code" },
    { name: "planType", label: "Plan type" },
    { name: "total", label: "Total" },
    { name: "startDate", label: "Start date" },
    { name: "customerName", label: "Customer name" },
  ]},
  menu_released: { entity: "menuWeek", fields: [
    { name: "weekStartIso", label: "Week starting" },
    { name: "cutoffLabel", label: "Cutoff" },
  ]},
  // … one per templated event
};
```

- Referenced in templates as `{{order.code}}` (entity-prefixed).
- Drives the editor's variable pills AND validates that a template only uses
  known variables.
- **Direct DB columns only** for now. Calculated/derived variables deferred.

---

## 4. `notification_template` table

```
notification_template
  ...updatableColumns("ntp")
  event     app_event              NOT NULL
  channel   notification_channel   NOT NULL      -- email | in_app (sms/whatsapp later)
  locale    locale                 NOT NULL      -- en | fr
  subject   text                   NOT NULL      -- email subject / in-app title
  body      text                   NOT NULL      -- Markdown (with {{vars}})
  enabled   boolean                NOT NULL default true
  UNIQUE (event, channel, locale)
```

DB is the live source. Admin edits take effect on the next send — no deploy.
Seeded once with sensible defaults per event/channel/locale.

---

## 5. Localization

- New `locale` pgEnum: `["en", "fr"]`, default `en`. Extendable later.
- New `users.locale` column (`locale`, default `en`).
- Render-time lookup: recipient's locale → fall back to `en` → generic fallback.
- Editor: locale switcher tabs (EN / FR) for the same event+channel.

---

## 6. Render pipeline (retires hand-written `templates.ts`)

```
app fires event
  → enqueue(tx, { event, recipientId, vars })        // vars = entity-field snapshot
  → outbox rows (one per resolved channel; payload = vars)
  → drainer:
       template = notification_template(event, channel, recipientLocale)
                  ?? notification_template(event, channel, "en")
                  ?? GENERIC_FALLBACK
       interpolate {{entity.field}} from payload vars
       email:  <Branded><Markdown>{md}</Markdown></Branded>
                 → render() → html
                 → render(..., { plainText:true }) → text
       in_app: title = rendered subject; body = plainText(md)
       NO template for (event, channel) → SKIP this channel (no send),
         record `skipped: no template` on the outbox row (terminal, no retry)
  → SES / in_app insert + AppSync broadcast
```

- **Snapshotting:** the entity field values are captured into the outbox
  `payload` at enqueue time, so a template renders from what was true at event
  time even if the row later changes.
- **No fallback:** the DB template is the source of truth. An event+channel with
  no template simply does not deliver on that channel — the outbox row is marked
  sent with `lastError = "skipped: no template"`. Operators must author a
  template (or seed one) for a channel to send. The `enqueue` `title`/`body` are
  retained only for the in-app feed's `href` + legacy callers, not as a render
  fallback.
- Stack (all free + OSS, MIT): `react-email` v6 (`<Markdown>`, `render`,
  `render(…, { plainText:true })`).

---

## 7. Variable interpolation

- Syntax: `{{entity.field}}` (e.g. `{{order.code}}`).
- Resolved against the outbox `payload` (`{ order: { code, total, … } }`).
- Missing variable → renders empty + logged (non-fatal). Unknown variable in a
  template is flagged at save time by validating against `EVENT_ENTITY`.
- ponytail: simple `{{…}}` replace, no logic/conditionals. Calculated vars and
  control flow deferred.

---

## 8. Admin UI — `settings/notifications`

Mirrors the wallet payout settings page (event list → per-event config).

- **Event list**: every templated `app_event`, showing which channels/locales
  have templates + enabled state.
- **Editor** (per event → channel → locale):
  - `@uiw/react-md-editor` (MIT) split edit/preview.
  - Variable pills from `EVENT_ENTITY` — click to insert `{{entity.field}}`.
  - Subject field.
  - Live email preview: server-renders the react-email output into an iframe.
  - Locale tabs (EN / FR).
  - Enable/disable toggle.
  - **Send test**: `POST /api/notifications/templates/test` renders the template
    with sample data from the registry and emails it to the acting admin.
- Admin-only (typed controls per [[admin-typed-controls]]); writes via the
  service layer per [[services-extend-commons-convention]].

---

## 9. Data flow summary

```
app event   → enqueue(tx, {event, recipientId, vars}) → outbox(payload=vars)
            → drainer → template(event,channel,locale) → render(vars) → SES / in_app
editor test → /api/notifications/templates/test → render(sampleVars) → SES to admin
```

---

## 10. Follow-up plan: Manual broadcast (separate spec)

NOT built here. Its own spec/plan will add:
- **Standalone templates** — not tied to an event (`broadcast_template` table);
  reuses the same Markdown → react-email render + variable engine.
- **User lists / segments** — admin builds a recipient list.
- **Send-now** to that list, with audit.

This spec keeps `notification_template.event` NOT NULL so broadcast layers on
without reworking event-bound templates.

---

## 11. Scope / YAGNI

Deferred: manual broadcast (own plan), calculated/derived variables, template
conditionals, per-user template overrides, sms/whatsapp templates, locales
beyond en/fr.

---

## 12. Open implementation notes

- Enum migration ordering (rename + add values + repoint columns) needs care;
  see [[drizzle-migrations-handwritten]] for the baseline approach.
- `users.locale` backfill defaults to `en`.
- Retire `apps/web/lib/notifications/templates.ts`; replace with the generic
  react-email fallback layout + DB lookup.
- Reconcile existing `users.notifyEmail` / `notifySms` opt-ins with
  `notification_prefs` (already noted in prior spec).
