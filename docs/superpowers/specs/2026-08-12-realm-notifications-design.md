# Realm Notifications — shared multi-channel notification and campaign platform

**Date:** 2026-08-12
**Status:** Design approved, pending implementation plan
**Scope:** New `@realm/notifications` package; puchkaman gains the full notification
system; tiffin-grab refactors onto the shared package; campaigns and bulk
messaging layer on top.

---

## 1. Context

`apps/tiffin-grab` contains a complete transactional notification system — an
outbox, a template store with a WYSIWYG editor, a drainer, per-user preferences
and an admin UI. `apps/puchkaman` has none of it: `lib/email/provider.ts` (raw
SES) and two ad-hoc `send()` calls (catering inquiry, auth security events).

The goal is not only to give puchkaman the same system, but to extend it into a
**notification and campaign platform**: bulk sends, uploaded contact lists, and
additional channels (SMS, WhatsApp) as they become available.

### 1.1 What was found during discovery

Several assumptions in the existing code no longer hold. They are recorded here
because they change what "port tiffin-grab's system" means.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| `enqueue()` has **zero callers** | `rg` across the repo returns only its own module | The pipeline is built but no business event emits into it. Nothing is being delivered today in either app. |
| The outbox drainer is **not scheduled** | `/api/notifications/drain/route.ts` cites an Amplify EventBridge function; no Amplify config exists in the repo; `DRAIN_SECRET` is absent from every env example | Even if events were emitted, nothing would drain them. |
| Realtime push **dead-ends** | `broadcast()` posts to AppSync, gated on `APPSYNC_GRAPHQL_URL`/`APPSYNC_API_KEY`, both commented out in `deployment/prod/tiffin-grab/.env.production.example:75-76`. Client `subscribeNotifications()` is a documented no-op stub. `/api/notifications/ws-token` returns `503`. | RabbitMQ delivers push messages to a consumer that calls a function that returns immediately. |
| SES is **out of sandbox** | `sesv2 get-account`: `ProductionAccessEnabled: true`, `Max24HourSend: 50000`, `MaxSendRate: 14/s`, both domains verified | Bulk sending is viable now. No support ticket needed. |
| `puchkaman-prod` config set has **no event destinations** | `get-configuration-set-event-destinations` returns `null`; `tiffin-grab-prod` has `sns-bounce-complaint` for BOUNCE+COMPLAINT | Puchkaman bounces reach the account-level suppression list but never reach the database. Must be fixed in phase 1. |
| `orders.user_id` already exists | `apps/puchkaman/db/schema/orders.ts:88` — nullable FK to `users.id`, never populated | Customer provisioning needs no new column on orders. |
| `notification_channel` already declares all four channels | `pgEnum("notification_channel", ["email","in_app","sms","whatsapp"])` | The schema is already channel-generic; `buildHandlers()` returns `Record<Channel, ChannelHandler \| undefined>`. |

The three Amplify-era artifacts (EventBridge drainer, AppSync broadcast,
ws-token route) are all individually guarded and fail silently, which is why
none of them surfaced as a bug. This design removes them.

---

## 2. Goals and non-goals

### Goals

1. A shared `@realm/notifications` package both apps consume, channel-generic
   and provider-injected.
2. Puchkaman customers exist as `users` rows (no login) so notifications have a
   recipient and orders have an owner.
3. Transactional notifications actually deliver in puchkaman: outbox, drainer,
   templates, admin UI, in-app feed and bell.
4. Campaigns: audience selection, uploaded contact lists, scheduling,
   per-channel content, stats.
5. Adding SMS or WhatsApp later is one handler plus one provider package — no
   changes to the outbox, campaigns, or admin UI.

### Non-goals

- Building SMS or WhatsApp providers now. Neither account exists.
- Giving puchkaman customers a login. Roles are provisioned, credentials are not.
- Wiring tiffin-grab's business events into `enqueue()`. Its emission stays
  unwired; only the refactor onto the shared package is in scope. (See §9.)
- Replacing tiffin-grab's RabbitMQ realtime path in this project. It is
  deletable once SSE lands, but that is a separate change. (See §9.)

---

## 3. Architecture

### 3.1 One delivery path

Transactional messages and campaign messages share a single delivery substrate.
Two paths would mean consent and suppression enforced in one and forgotten in
the other.

```
  transactional                          campaign
  event ──► notification_template        audience ──► campaign_content
            (event, channel, locale)                  (campaign, channel, locale)
        │                                          │
        └──────────────┬───────────────────────────┘
                       ▼
              enqueue()  ── resolveChannels(wanted, prefs, suppression)
                       ▼
              notification_outbox          ← durability, retry, backoff, dedupe
                       ▼
              drainer worker  ── claim (FOR UPDATE SKIP LOCKED), rate limit
                       ▼
              providers[channel]           ← email | sms | whatsapp | in_app
```

A campaign is a bulk `enqueue()`. Same policy resolution, same preferences, same
retry semantics, same suppression check. Only two things differ: recipients come
from an audience rather than a single id, and content comes from the campaign
rather than an event template.

### 3.2 Why Postgres is the queue

`notification_outbox` already provides every property a broker would be brought
in for: `FOR UPDATE SKIP LOCKED` claim, `attempts`, `next_attempt_at` backoff,
`last_error`, `status='failed'` as a dead-letter state, and a unique
`dedupe_key`.

More importantly, `enqueue()` inserts **inside the caller's transaction**, so a
notification commits atomically with the business change it describes.
Publishing to a broker at that moment reintroduces the dual-write problem the
transactional outbox pattern exists to solve: the transaction commits and the
publish fails, or the reverse, producing a paid order with no confirmation or a
confirmation for an order that rolled back. Broker durability cannot fix a
failure that occurs *between* two stores.

Postgres `LISTEN`/`NOTIFY` is the obvious way to remove poll latency and is
**rejected**: both apps front their database with pgbouncer
(`deployment/prod/*/pgbouncer/`). In transaction pooling mode a `LISTEN` binds
to a backend that is handed to another client on the next statement, and
notifications are silently lost.

### 3.3 Drainer

A long-lived worker, matching the shape of the existing `notify-consumer`
service in `deployment/prod/tiffin-grab/docker-compose.yml`:

```yaml
drainer:
  image: ${TOOLS_IMAGE}:${IMAGE_TAG:-latest}
  command: ["pnpm","--filter","<app>","exec","tsx","workers/notify-drainer.ts"]
  restart: unless-stopped
```

```ts
// apps/<app>/workers/notify-drainer.ts
const INTERVAL = 15_000;
for (;;) {
  try { await drainPending(); }
  catch (err) { log.error({ err }, "drain failed"); }  // the loop must never die
  await sleep(INTERVAL);
}
```

`drainPending()` already loops batches until the queue empties, so a burst
clears immediately; the interval only bounds *idle* latency.
`/api/notifications/drain` is retained as a manual kick, and `DRAIN_SECRET` is
added to both env examples.

**Priority.** The claim query currently orders by `next_attempt_at` alone. Once
campaigns share the pipe, a 4,000-recipient send would sit ahead of an order
confirmation queued a second later. The claim ordering becomes:

```sql
ORDER BY (kind = 'transactional') DESC, next_attempt_at ASC
```

**Rate limiting.** A token bucket caps sends to SES `MaxSendRate` (env
configured, default 14/s, conservative). Exceeding the rate causes throttling,
which damages sender reputation.

`SendBulkEmailCommand` is **not** used: it renders SES-side templates, but
templates live in Postgres with the package's own `interpolate()`, and each
recipient needs a unique unsubscribe token. Per-recipient `SendEmail` (already
implemented in `packages/email`) plus rate limiting is correct here.

### 3.4 Realtime

Puchkaman is a single instance and already depends on `@realm/realtime` (SSE +
in-memory bus, currently unused). It gets the SSE transport directly — no
RabbitMQ, no consumer worker, no ws-token route.

`buildHandlers()` takes `broadcast` as a parameter, so tiffin-grab keeps
injecting its Rabbit-then-AppSync implementation unchanged while puchkaman
injects the SSE one. The package stays ignorant of both.

---

## 4. `@realm/notifications`

### 4.1 Layering

Depends on `@realm/commons` and `@realm/database` only. It does **not** depend
on `@realm/email` — the provider interface is defined here and the app adapts
`EmailProvider` to it, so future `@realm/sms` / `@realm/whatsapp` packages are
siblings rather than dependencies. `ui/` depends on `@realm/ui` and
`@realm/design-system`.

Added to both apps' `transpilePackages` in `next.config.ts` (the `ui/` subpath
is client code).

```
packages/notifications/src/
  schema.ts        makeNotificationTables({ users, appEvent, locale })
  types.ts         ChannelProvider, OutboundMessage, Channel, Kind
  policy.ts        resolveChannels, nextBackoffMs, MAX_ATTEMPTS   (pure, moves verbatim)
  enqueue.ts       enqueue(tx, tables, input) | enqueueToRole(tx, tables, input)
  template.ts      pickTemplate, renderForEvent, renderForCampaign
  interpolate.ts   re-export from @realm/email or move here
  handlers.ts      buildHandlers({ db, tables, providers, broadcast })
  drain.ts         drainPending({ db, tables, handlers, rateLimit })
  feed.ts          getFeed, markRead
  suppression.ts   SES/SNS feedback → message_suppression
  audience.ts      resolveAudience(db, tables, segment, listIds) → recipients
  campaign.ts      materializeCampaign(tx, tables, campaignId)
  unsubscribe.ts   HMAC token sign/verify/buildUrl  (pattern lifted from @realm/google-reviews)
  ui/
    template-list.tsx  template-editor.tsx  email-editor.tsx
    notification-bell.tsx  notifications-nav.tsx
    campaign-list.tsx  campaign-composer.tsx  audience-builder.tsx
    contact-list-upload.tsx
```

### 4.2 Table factory

The tables reference app-owned things: `users.id` as a foreign key, and
`app_event` — a per-app enum (tiffin-grab has 18 subscription events, puchkaman
needs pickup and delivery ones). Two apps cannot share one enum, so the package
exports a **factory**, not tables:

```ts
export function makeNotificationTables(deps: {
  users: AnyPgTable;      // the app's users table, for the FK
  appEvent: PgEnum;       // the app's event enum
  locale: PgEnum;         // the app's locale enum
}) {
  return {
    notificationChannel, outboxStatus,
    notifications, notificationOutbox, notificationPrefs,
    notificationTemplate, messageSuppression,
    campaign, campaignContent, contactList, contactListMember,
  };
}
```

Each app calls it from its own `db/schema/notifications.ts` and re-exports, so
`drizzle-kit` generates that app's migration. This is exactly the pattern
`@realm/google-reviews` already uses for `review_nudges`.

Functions take `db`/`tx` and `tables` as parameters, with the loose
`PostgresJsDatabase<any>` generic used elsewhere in the monorepo (a concrete
schema generic would reject every app's `db`). The package never imports an app.

### 4.3 Provider interface

```ts
export interface OutboundMessage {
  to: { email?: string; phone?: string; name?: string };
  subject?: string;              // email only
  html?: string; text?: string;  // email / sms body
  providerTemplateId?: string;   // whatsapp / templated sms
  vars?: Record<string, unknown>;
}

export interface ChannelProvider {
  send(msg: OutboundMessage): Promise<{ providerMessageId: string }>;
}

buildHandlers({
  db, tables,
  providers: { email: adaptEmailProvider(ses), sms: undefined, whatsapp: undefined },
  broadcast,
});
```

`in_app` has no external provider; it is handled internally (insert feed row,
then broadcast).

---

## 5. Schema

### 5.1 Carried over from tiffin-grab, with changes

**`notifications`** — in-app feed. Unchanged.

**`notification_outbox`** — one row per (recipient, channel). Changes:

| Column | Change | Reason |
| --- | --- | --- |
| `recipient_id` | **becomes nullable** | Imported contacts have no user row |
| `recipient_email` | **new**, nullable | Address for a non-user recipient |
| `recipient_phone` | **new**, nullable | Same, for SMS/WhatsApp |
| `kind` | **new**, `'transactional' \| 'marketing'`, not null | Drives priority, consent, unsubscribe scope |
| `campaign_id` | **new**, nullable FK | Links a row to its campaign for stats |

Constraint: exactly one of `recipient_id` or (`recipient_email` /
`recipient_phone`) must be present. Index on `(campaign_id, status)` for
campaign progress. Claim index becomes `(kind, status, next_attempt_at)`.

**`notification_prefs`** — per-user preference. Key becomes
**`(user_id, channel, kind)`**, so opting out of marketing email does not stop
order confirmations. New columns `consent_source`
(`purchase | express | import`), `consent_at`. The `suppressed` /
`suppressed_reason` columns **move out** (see below).

**`notification_template`** — unchanged except `provider_template_id` (nullable).

### 5.2 New tables

**`message_suppression`** — address-keyed, replacing the user-keyed suppression
columns.

```
address       text not null      -- normalized email or E.164 phone
channel       notification_channel not null
reason        text not null      -- bounce | complaint | unsubscribe | manual
created_at    bigint not null
unique (address, channel)
```

Suppression is a fact about an address; preference is a choice by a user. SES
reports a bounce for `foo@bar.com`, not for a user id, and an imported contact
has no user row to hang it on. Keeping it user-keyed would also let the same
address be suppressed as a user while still being mailed as a list member.
`@realm/google-reviews` reached the same conclusion for `review_nudges`
("keyed on email because puchkaman orders are guest checkout").

**`campaign`**

```
name          text not null
channels      notification_channel[] not null
kind          text not null default 'marketing'
audience      jsonb not null      -- { segment: {...}, listIds: [...] }
status        campaign_status not null default 'draft'
                                 -- draft|scheduled|sending|sent|paused|cancelled
scheduled_at  bigint
sent_at       bigint
counts        jsonb               -- { queued, sent, failed, opened, clicked, bounced, unsubscribed }
```

**`campaign_content`** — same shape as `notification_template`, keyed on
`(campaign_id, channel, locale)`: `subject`, `body` (editor source), `html`,
`text`, `provider_template_id`.

**`contact_list`**

```
name            text not null
consent_source  text not null   -- existing_customers | express_optin | event_signup | other
consent_at      bigint not null
consent_note    text
member_count    integer not null default 0
```

**`contact_list_member`**

```
list_id         bigint not null references contact_list(id)
email           text
phone           text
name            text
vars            jsonb           -- merge fields from the CSV
unsubscribed_at bigint
unique (list_id, email) where email is not null
unique (list_id, phone) where phone is not null
```

### 5.3 Puchkaman-specific

- `locale` pgEnum (`en`) added; `users.locale` column, default `en`.
- `users.phone`, `users.phone_verified` — needed for SMS/WhatsApp. Puchkaman's
  `users` has neither; phone currently lives only on `orders.customer_phone`.
- New `app_event` pgEnum, matched to the real `order_status` / `payment_status`
  lifecycles:

| Event | Recipient | Default channels |
| --- | --- | --- |
| `order_placed` | customer + staff | email / in_app |
| `order_paid` | customer + staff | email / in_app |
| `order_fulfilled` | customer | email |
| `order_cancelled` | customer + staff | email / in_app |
| `payment_failed` | staff | in_app |
| `refund_issued` | customer | email |
| `catering_inquiry` | staff | email + in_app |
| `contact_message` | staff | in_app |
| `signup` | — | reserved |

`enqueueToRole()` is new (tiffin-grab has no equivalent): staff-facing events
fan out to all active `admin`/`member` users, because puchkaman customers cannot
log in and have nowhere to see an in-app notification.

---

## 6. Puchkaman customer users

Customers become `users` rows with no credential:

- `role: "user"` — already present in the enum and currently unassigned.
- `status: "active"`, `passwordSet: false`, **no `account` row**, so there is no
  credential to authenticate with.
- An explicit `role !== "user"` check is added to the `session.create.before`
  hook in `lib/auth/index.ts`, so a future email-OTP flow cannot accidentally
  mint a customer session. `requireStaff` and the permission map already reject
  the role, but the hook is the single choke point worth defending.

`upsertCustomer(tx, { email, name, phone })` is called from:

1. Checkout order creation — sets `orders.user_id`.
2. The catering inquiry route.
3. The contact form.

Dedupe is by the existing partial unique index `users_email_unique`.

**Backfill migration** creates users from `distinct customer_email` in `orders`
and links `orders.user_id`. Local dev is empty (`users=0 orders=0 payments=0`,
products=46), so it is a no-op there; it is written to be correct either way.
**Production row counts were not verified** — SSH to the puchkaman box was
blocked in this environment. The migration is idempotent and safe regardless,
but the counts should be checked before running it.

Imported contacts do **not** become users. They are people who have not
transacted, cannot log in, and would pollute the admin user list and the
permission model.

---

## 7. Consent and compliance

puchkaman.ca mails Canadian recipients, so **CASL** applies. It is stricter than
CAN-SPAM, covers **all** commercial electronic messages including SMS, and
carries penalties up to $10M for organizations. The requirements below are
schema and flow constraints, not optional polish.

1. **Implied consent from a purchase expires after 24 months.** Consent is
   therefore not a boolean: `notification_prefs` and `contact_list` both store
   `consent_source` and `consent_at`, and audience resolution excludes lapsed
   implied consent.
2. **Every commercial message carries a working unsubscribe** that functions
   without a login and is honored within 10 business days. The HMAC-signed
   stateless token pattern in `packages/google-reviews/src/unsubscribe.ts` is
   lifted as-is: no DB lookup to issue or verify, and an identical response
   whether or not the address exists, so the endpoint never reveals membership.
3. **Sender identity and a physical mailing address** appear in the campaign
   layout, not left to whoever writes the copy.
4. **Unsubscribe scope is `kind`-specific.** Opting out of marketing must never
   suppress a transactional receipt. This is why `notification_prefs` keys on
   `(user, channel, kind)`.
5. **Uploaded lists must record consent provenance.** An imported list has no
   consent record unless one is supplied; mailing a purchased or scraped list is
   not permitted. The import flow captures source, date and a free-text note on
   `contact_list`.
6. **SMS requires automatic STOP/ARRÊT handling** — an inbound webhook that
   writes `message_suppression`, not a UI checkbox.

---

## 8. Phases

### Phase 1 — engine

1. Create `packages/notifications` with the factory, policy, enqueue, template,
   handlers, drain, feed, suppression, and `ui/`.
2. Refactor tiffin-grab onto it: schema barrel calls the factory,
   `lib/notifications/*` become thin binders, dashboard pages import package UI.
   `email_log` and the Rabbit push stay app-local and are injected.
3. Puchkaman: `locale`, `users.phone`, customer provisioning, backfill, session
   hook guard.
4. Puchkaman: `app_event` enum, event emission inside existing transactions at
   order status transitions and payment settle/webhook.
5. Puchkaman: `email_log` + provider wrapper (currently unaudited).
6. Both: `workers/notify-drainer.ts` + compose service, `DRAIN_SECRET` in env
   examples.
7. Puchkaman: SSE realtime transport, bell in the CRM header, `/dashboard/notifications`
   (Templates, Emails, Logs, Analytics) via package UI, nav entry in
   `app/(dashboard)/dashboard/layout.tsx`.
8. Add SNS event destinations to the `puchkaman-prod` configuration set for
   BOUNCE and COMPLAINT, plus the suppression webhook.
9. Delete the dead AppSync artifacts in tiffin-grab: `/api/notifications/ws-token`
   and the commented `APPSYNC_*` env vars. `broadcast()` is **retained** as
   tiffin-grab's injected transport — its AppSync body is already inert, and
   replacing it with SSE is what unlocks the Rabbit removal deferred in §9.
   Removing it here without that replacement would change nothing observable
   while making the later change harder to reason about.

Schema carries `kind`, `campaign_id`, `provider_template_id`,
`recipient_email`/`recipient_phone` and the consent columns from day one, unused.
They are nearly free now; retrofitting a unique index onto a table that already
violates it is not.

### Phase 2 — campaigns

1. `campaign`, `campaign_content`, `contact_list`, `contact_list_member`.
2. CSV upload through `@realm/storage` (S3) with a column-mapping step, parse,
   normalize, dedupe, validate.
3. Audience builder: saved filter over users/orders (last order date, order
   count, total spend, delivery zone, has-active-order) ∪ selected contact
   lists, minus suppression, minus unsubscribed, with a live count.
4. Composer reusing `@react-email/editor`, per-channel content, test send.
5. Scheduling; `materializeCampaign()` bulk-inserts outbox rows at send time —
   those rows are the immutable record of who was mailed, and the compliance
   evidence.
6. Unsubscribe route + campaign footer.
7. Token-bucket rate limiter; transactional priority in the claim query.
8. SES configuration set event destinations extended to DELIVERY, OPEN, CLICK;
   stats folded into `campaign.counts`.
9. Campaigns admin UI.

### Phase 3 — channels

`@realm/sms` and `@realm/whatsapp` implementing `ChannelProvider`, plus the
inbound STOP webhook. Pure addition: no change to the outbox, campaigns, or
admin UI.

Known lead times, for planning only:

| Channel | Blocker | Lead time |
| --- | --- | --- |
| SMS (Canada) | Toll-free or 10DLC number + carrier verification; mandatory automatic STOP handling | days–weeks |
| WhatsApp | Meta Business verification, WABA, per-template approval. Business-initiated messages outside the 24h customer-service window must use a pre-approved template, so content is a template id + variables, not free-form copy. Nothing has been started — the catering route notes no WhatsApp Business API account exists. | weeks |

### Parallel, not blocking

- ~~Add SES read actions to the `realm-admin` IAM policy.~~ **Done** —
  managed policy `realm-ses-read` (`ses:Get*`/`List*`/`Describe*`, tagged
  `app=shared`) created and attached. Phase 1 step 8 additionally needs
  `ses:PutConfigurationSetEventDestination` and SNS write, granted at that point
  rather than up front.
- Rotate off root access keys. The `default` profile is
  `arn:aws:iam::<acct>:root`; root access keys are the one credential AWS
  advises deleting outright. Out of scope here, but it is the highest-severity
  finding of this discovery.

---

## 9. Explicitly deferred

- **tiffin-grab event emission.** `enqueue()` remains uncalled there. Wiring
  order/payment/menu events is a separate change; this project only moves it
  onto the shared package.
- **tiffin-grab RabbitMQ removal.** Once tiffin's `subscribeNotifications()`
  stub is replaced with the SSE transport, the Rabbit path, the `worker` compose
  service, `lib/notifications/rabbit.ts` and `workers/notify-consumer.ts` all
  become deletable. Worth doing, not in scope.

---

## 10. Verification

Per `AGENTS.md`, `tsc` is the gate because packages ship source.

```bash
pnpm turbo typecheck && pnpm turbo test
```

Additional gates specific to this change:

1. **tiffin-grab must produce an empty migration diff.** The factory must emit
   column-for-column identical DDL for the tables tiffin-grab already has (aside
   from the deliberate additions in §5.1, which are a real migration for both
   apps). Run `drizzle-kit generate` for tiffin-grab and inspect: anything
   unexpected means the factory is wrong.
2. **The two `tsc`-blind traps** (`AGENTS.md`): confirm by eye that no
   `"use client"` directive was stripped when components moved into the package,
   and that no client symbol was demoted from a named export.
3. **Migration equivalence.** Apply the new migrations to a scratch database and
   diff against one built from the previous baseline plus hand-written DDL, per
   the approach recorded for drizzle squash behaviour.
4. **Drainer correctness.** Integration test with two concurrent drainers
   asserting no row is delivered twice (`FOR UPDATE SKIP LOCKED`), and that a
   handler returning `null` (no template) terminates without retry.
5. **Consent enforcement.** Test that a `marketing` unsubscribe leaves
   `transactional` delivery intact, and that a `message_suppression` row blocks
   both.
6. Live-DB tests follow the existing harness conventions (local pg + redis via
   `vitest.config` `test.env`; apply new migrations to the local DB first; scope
   cleanup to the test's own identifiers rather than wiping shared tables).

---

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| The tiffin-grab refactor breaks a working system | It is currently *not* working end to end (no emission, no drainer, no push). The blast radius is smaller than it appears. Gate on the empty-diff check and the full test suite. |
| Sender reputation damage from bulk sending | Rate limiter capped below `MaxSendRate`; suppression enforced before every send; bounce/complaint destinations added to puchkaman's config set in phase 1, before any campaign exists. |
| CASL exposure from uploaded lists | Consent provenance is mandatory on `contact_list`; audience resolution excludes lapsed implied consent and unsubscribed members. |
| Campaign sends delay transactional mail | `kind`-first claim ordering, added in phase 1 while the column is still unused. |
| Production puchkaman row counts unknown | Backfill migration is idempotent; counts to be verified before running. |

---

## 12. Open items

1. Verify puchkaman **production** `users` / `orders` row counts before the
   backfill migration runs.
2. Confirm the SES `MaxSendRate` value to configure the token bucket against —
   14/s at time of writing, but it rises automatically with volume.
