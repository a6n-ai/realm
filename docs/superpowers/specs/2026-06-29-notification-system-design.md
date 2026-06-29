# Notification System — Architecture Design

**Date:** 2026-06-29
**Status:** Design locked, pre-implementation
**Scope (slice 1):** Email (Amazon SES) + In-app (real-time WebSocket)
**Deploy target:** AWS Amplify Gen 2 (Next.js SSR)

---

## 1. Decision: package, not microservice

The reference project `ikara/nocode-saas` is a Spring microservice stack —
`eureka` (discovery) + `gateway` + a dedicated `notification` service +
`commons-mq`. That topology solves independent-deploy / independent-scale /
multi-language problems.

Tiffin Grab is **one Next.js app, one Postgres, one team, serverless on
Amplify**. None of those problems exist. A notification microservice +
discovery + gateway would add network hops, a second deploy target, and
eventual-consistency bugs to solve nothing.

**Build a package** (`@tiffin/commons-notify`) with a channel abstraction.
Same code separation the ikara service has, none of the distributed-systems
cost. The package boundary is also the seam to extract a service later if
volume ever demands it — nothing is lost by waiting.

Extract a service only when ONE holds: sustained send volume needs
independent scaling; a non-JS service must also send; or delivery latency
must be fully decoupled from web capacity.

---

## 2. Domain design (ported from ikara notification service)

The ikara service's internal design transfers 1:1; only the runtime substrate
changes.

| ikara (Spring)                       | Tiffin Grab (Amplify/TS)                  |
|--------------------------------------|-------------------------------------------|
| `NotificationsQueListener` (MQ)      | EventBridge-scheduled Lambda draining outbox |
| `NotificationSendService`            | `dispatcher.ts`                           |
| `NotificationPreferenceService`      | `notification_prefs` + prefs lookup       |
| `AbstractTemplateService` + msg-resource | `templates/` render fns                |
| `email/AbstractEmailService` → `SendGridService`/`SMTPService` | `channels/` → `Channel` iface + `ses.ts` |
| `InAppNotificationService`           | `channels/in-app.ts` + `notifications` table |
| `NotificationType` enum              | `events.ts` typed event catalog           |

---

## 3. Channel abstraction

```ts
interface Channel {
  key: 'email' | 'in_app' | 'sms' | 'whatsapp'
  send(to: Recipient, msg: RenderedMessage): Promise<DeliveryResult>
}
```

Adding SMS/WhatsApp later = one new adapter file, zero caller changes. This is
the entire reason for going package-first: the **channel seam** (not a network
seam) is what makes new channels cheap.

Slice-1 adapters: `ses.ts` (email), `in-app.ts` (DB insert + AppSync
broadcast).

---

## 4. Reliability: transactional outbox

```
feature code → notify(event, userId, data)
                   │
                   ▼
   INSERT notification_outbox row  ← SAME Postgres txn as the business write
                   │  (atomic: order+notification commit together or not at all)
                   ▼
   EventBridge-scheduled Lambda (drainer) picks up pending rows
                   │
   dispatcher: load prefs → fan out to enabled channels
       ├─ email   → SES SendEmail
       └─ in_app  → INSERT notifications row → AppSync `publish` mutation (WS push)
```

The outbox gives the same crash-safe guarantee a message broker would, using
the Postgres already in the stack. No order "saved but email lost"; no email
"sent for an order that rolled back."

---

## 5. Email — Amazon SES (NOT SNS)

SNS email is plain-text, requires per-address opt-in confirmation, no
templates, no personalization — wrong tool for transactional customer mail.
**SES** is the sender.

- SDK: `@aws-sdk/client-sesv2`, `SendEmail`.
- Auth: **IAM role** on the drainer Lambda (`ses:SendEmail`). No access keys.
- **SES → SNS feedback loop** is the one correct SNS role: SES publishes
  bounce/complaint/delivery events to an SNS topic → HTTPS subscription →
  `/api/webhooks/ses` → mark address suppressed in `notification_prefs`.
  Required to protect sender reputation or SES throttles.

### SES pre-reqs (lead time — start immediately)
- Verify **domain** + enable **DKIM**, set SPF + DMARC DNS records (else GTA
  Gmail/Outlook spam-folders us).
- Request **production access** to exit the SES sandbox (~24h approval).
- Create SES→SNS bounce/complaint topic; subscribe the webhook route.

---

## 6. In-app — real-time over WebSocket (AppSync, no polling)

Amplify Gen 2 `data` = AppSync. **Sharp edge:** AppSync subscriptions fire only
on AppSync mutations, not on external Drizzle writes. So:

- Define a custom mutation **`publish`** backed by a **NONE data source**
  (broadcast-only, touches no DB).
- Define `a.subscription().for(a.ref('publish'))`, filtered by `userId`.
- The `in-app` channel, after the Drizzle `INSERT` into `notifications`, calls
  the `publish` mutation → AppSync fans out over WebSocket to that user's
  subscribed clients.
- Postgres stays source of truth (feed reads via a custom SQL data source or a
  normal Next route handler). AppSync is pure transport — no DynamoDB, no
  double-writing domain data.

Client: `client.subscriptions.<name>(...)` (or `generateClient().models...`)
in a React effect; unread badge from a count query; reconnect handled by the
Amplify client.

Polling explicitly rejected per requirement.

---

## 7. Amplify Gen 2 topology

```
no discovery service   — managed AWS; not needed
no API gateway         — Amplify Hosting is the edge
no message broker       — Postgres outbox + EventBridge
```

```
packages/commons-notify/            provider-agnostic core
  channels/ses.ts, in-app.ts, types.ts
  templates/                        render(event,data) → {subject,html,text,inAppBody}
  dispatcher.ts                     prefs → fan out
  events.ts                         typed event catalog (port of NotificationType)
packages/commons-drizzle/schema/
  notifications.ts                  in-app feed (userId,type,title,body,readAt,createdAt)
  notification_outbox.ts            outbox queue (payload,status,attempts,createdAt)
  notification_prefs.ts             per-user per-channel + suppression
apps/web/
  app/api/notifications/route.ts    feed + unread count + mark-read
  app/api/webhooks/ses/route.ts     SNS bounce/complaint → suppress
amplify/                            Gen 2 backend (TypeScript/CDK)
  data/resource.ts                  AppSync: publish mutation (NONE) + subscription
  functions/notify-drainer/         EventBridge schedule (~1 min); IAM ses:SendEmail
```

---

## 8. Preferences from day one

`notification_prefs` (per-user, per-channel enable + suppression) ships in
slice 1. Retrofitting opt-out / suppression across existing send paths later is
painful; the table is cheap now and mirrors the existing per-user feature-flag
pattern.

---

## 9. Deferred (YAGNI)

- SMS / WhatsApp adapters — interface ready; write on real requirement.
- Discovery / gateway / broker — only on service extraction.
- i18n message-resource layer (ikara has it) — single-locale now; add when a
  second locale lands.

---

## 9a. Built so far (2026-06-29)

- `@tiffin/commons-notify`: `EmailProvider` + `AbstractEmailProvider`
  (validate/normalize/default-from), `SesEmailProvider` (SESv2, injectable
  client, configuration-set → SNS). Provider-agnostic, DB-free. Tests green.
- `apps/web/db/schema/notifications.ts`: `notifications`, `notification_outbox`,
  `notification_prefs` (+ 3 enums). Migration `0009_dark_maestro.sql` generated
  (NOT yet applied).
- `apps/web/lib/notifications/`: `enqueue` (tx-joined, per-channel outbox rows,
  dedupe), `drain` (FOR UPDATE SKIP LOCKED claim → handlers → backoff/dead-letter),
  `handlers` (in_app insert; email via SES+template), `templates` (per-event email
  renderers + generic fallback), `policy` (pure: backoff, channel resolution; tested).

### Decisions taken
- **Log = the outbox row.** Sent rows are retained (status `sent` +
  `providerMessageId` + error history) — that IS the delivery log. A dedicated
  `notification_log` only when we want to prune the queue while keeping history.
- **`users.notifyEmail` honored.** No pref row → email channel defers to the
  existing `notifyEmail` opt-in (else opted-out users would be mailed). Explicit
  `notification_prefs` row overrides it. Migrate notifyEmail → prefs later.

## 9b. Amplify Gen 2 backend (built 2026-06-29)

Migration `0009` applied to live Postgres (3 tables confirmed). `amplify/`
backend typechecks against real Amplify types.

```
amplify/
  backend.ts                          defineBackend({ data, notifyDrainer, appsyncAuthorizer })
  data/resource.ts                    AppSync: publish mutation (NONE) + onNotification subscription
  data/publish.js                     NONE resolver — relays args to subscribers
  data/receive.js                     enhanced filter pinned to authorizer userId (not client arg)
  functions/notify-drainer/           schedule "every 1m" → POST app /api/notifications/drain
  functions/appsync-authorizer/       verifies app-minted HS256 WS token → resolverContext.userId
apps/web/app/api/notifications/
  drain/route.ts                      secret-guarded → drainPending()
  ws-token/route.ts                   logged-in user → 5-min HS256 token (sub = internal id)
apps/web/lib/notifications/broadcast.ts   server→AppSync publish via API key; no-op if env unset
```

**WebSocket auth chain (Auth.js → AppSync):** browser calls `ws-token` (Auth.js
session) → gets short HS256 token (sub = internal user id) → opens
`onNotification` subscription with it → Lambda authorizer verifies → resolver
pins the filter to that id. A client can only ever receive its own
notifications. Server publishes via the AppSync API key (server secret).

**Drainer:** does NOT bundle the app. Scheduled Lambda just POSTs the shared
secret to `/api/notifications/drain`; all delivery logic stays in the app where
the Postgres client lives.

### Env / secrets required
App (Amplify Hosting compute env):
`AWS_REGION`, `NOTIFY_FROM_EMAIL`, `NOTIFY_FROM_NAME`, `SES_CONFIGURATION_SET`,
`DRAIN_SECRET`, `APPSYNC_GRAPHQL_URL`, `APPSYNC_API_KEY`, `APPSYNC_AUTH_SECRET`,
`APP_PUBLIC_URL`.
Amplify backend secrets (`npx ampx sandbox secret set …`): `DRAIN_SECRET`,
`APPSYNC_AUTH_SECRET` (must match the app). Drainer function env: `DRAIN_URL`
(deployed `/api/notifications/drain`).
> `DRAIN_SECRET` + `APPSYNC_AUTH_SECRET` are shared between app and backend —
> set the SAME value in both places.

### Deploy runbook
1. `npx ampx sandbox` (dev) — provisions AppSync + functions; writes `amplify_outputs.json`.
2. Grant the drainer/app IAM `ses:SendEmail` (CDK override in `backend.ts` —
   TODO once SES identity exists).
3. SES: verify domain + DKIM/SPF/DMARC, request production access, create the
   configuration set → SNS bounce/complaint topic.
4. Wire the frontend subscribe hook (uses `aws-amplify` + `amplify_outputs.json`).

## 9c. Frontend bell (built 2026-06-29)

```
apps/web/lib/notifications/feed.ts          getFeed / markRead / currentUserId
apps/web/app/api/notifications/route.ts     GET feed+unread, POST mark-read
apps/web/components/notifications/
  realtime.ts        env-configured AppSync subscribe (lambda auth + ws-token); no-op if unset
  use-notifications.ts   fetch on mount + focus; prepend live pushes; mark-all-read
  notification-bell.tsx  Popover bell, unread badge, list, mark-read-on-open
```
Mounted in the dashboard header. Realtime lights up when `NEXT_PUBLIC_APPSYNC_URL`
is set; until then the bell is fetch-only (works today). Extra client env:
`NEXT_PUBLIC_APPSYNC_URL`, `NEXT_PUBLIC_AWS_REGION`.

## 10. Open items (next)
- **SES bounce/complaint webhook**: `/api/webhooks/ses` → set
  `notification_prefs.suppressed`.
- **IAM**: attach `ses:SendEmail` to the app compute role (CDK override).
- Seed/migrate `notifyEmail` → `notification_prefs`.
- First real `enqueue()` call sites (order_confirmed, menu_released, …).
- Confirm Amplify Gen 2 `data` will use a **custom SQL data source** pointed at
  the existing Postgres (vs. feed reads staying in plain Next route handlers —
  lazier, recommended for slice 1).
- Drainer cadence (default: every 1 min).
- Event catalog v1 list (order confirmed, menu released, inquiry follow-up, …).
