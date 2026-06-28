# Customer Support Tickets — Design

Date: 2026-06-28
Status: Approved

## Goal

Let logged-in customers raise a support ticket / complaint about something in the
app (an order today; billing, catering later) as easily as possible, and let
sales/support staff work and resolve those tickets. Customer and staff
communicate on a **two-way message thread**.

## Approach (chosen)

Clone the existing `inquiries` feature shape. Inquiries already model exactly this
flow — a record with a status pipeline, an append-only activity timeline, an owner
assignment, and automatic audit via `SessionUpdatableService`. Tickets reuse that
structure rather than inventing a new one. The only genuinely new concern is the
**ownership trust boundary**: tickets are customer-created, so a customer may only
read/reply to their own tickets.

Rejected: a generic "comments" subsystem or a third-party helpdesk integration —
both are more than the feature needs and ignore the in-repo analog.

## Data model — `apps/web/db/schema/tickets.ts`

```
ticketStatus       = enum(open, in_progress, waiting_on_customer, resolved, closed)
ticketCategory     = enum(order, billing, catering, general)
ticketPriority     = enum(low, normal, high, urgent)            // staff-set
ticketMessageAuthor= enum(customer, staff, system)

tickets (updatableColumns "tkt")
  raisedBy      bigint -> users.id        notNull   // the customer
  subject       text                       notNull
  category      ticketCategory             notNull
  status        ticketStatus  default open notNull
  priority      ticketPriority default normal notNull
  currentOwner  bigint -> users.id         null      // assigned staff
  orderId       bigint -> orders.id        null      // linked order (category=order)
  closedAt      bigint (epoch-ms)          null
  indexes: raisedBy, currentOwner, status

ticket_messages (baseColumns "tms")
  ticketId    bigint -> tickets.id (onDelete cascade) notNull
  authorId    bigint -> users.id                       notNull
  authorType  ticketMessageAuthor                      notNull
  body        text                                     notNull
  index: (ticketId, createdAt)   // latest-message + timeline queries
```

Status changes and assignment/priority edits are recorded as `system` messages
(e.g. body `"Status: open → resolved"`) so the thread is a single ordered log —
same idea as `inquiry_activities` rows, collapsed into the message stream.

## Service — `apps/web/lib/services/tickets.service.ts`

Extends `SessionUpdatableService<typeof tickets>` (per the services-extend-commons
convention — writes auto-audit). Mirrors `inquiries.service.ts`.

- `create({ subject, category, body, orderId? })` — `raisedBy = current user`;
  inserts the ticket + first `customer` message. Validates non-empty subject/body.
- `reply(publicId, body)` — appends a message. Author type derived from caller role
  (customer vs staff). A **customer reply on a resolved ticket reopens it** to
  `open`; a staff reply may move `in_progress → waiting_on_customer`.
- `changeStatus(publicId, toStatus)` — staff only; writes a `system` message; sets
  `closedAt` when moving to resolved/closed, clears it when reopened.
- `assign(publicId, ownerId)` / `setPriority(publicId, priority)` — staff; `system`
  message each.
- `listForCustomer(userId)` — the customer's own tickets (newest first).
- `listForQueue(sort)` — staff pipeline rows: subject, customer, category, status,
  owner, priority, last-message-at; overdue = waiting-on-staff past a threshold.
- `listMessages(publicId)` — ordered thread.

**Authorization (trust boundary — not simplified away):** a private helper asserts
`ticket.raisedBy === currentUserId() || isStaff`. Every customer-facing read/reply
goes through it. Staff (admin/member) bypass via role.

## Customer UI — under `app/(dashboard)/dashboard/`

`(dashboard)` already renders `CustomerDashboard` for role `user`; these pages gate
on session and show the customer only their own data.

- `support/page.tsx` — "My tickets" list + **New ticket** button.
- `support/new/page.tsx` + `new-ticket-form.tsx` — subject, category select, optional
  order dropdown (their own orders), first message. Server action → `create`.
  Accepts `?orderId=` to pre-fill + preselect category `order`.
- `support/[id]/page.tsx` — thread view + reply box (server action → `reply`).
- **"Report an issue"** button on each order in `CustomerDashboard`, linking to
  `support/new?orderId=…`.
- Add **Support** entry to the customer sidebar nav.

## Staff UI — under `app/(dashboard)/dashboard/` (mirrors inquiries pages)

- `tickets/page.tsx` — queue table (`requireStaff`), sortable like the inquiries
  pipeline; row → detail.
- `tickets/[id]/page.tsx` + `ticket-controls.tsx` — thread + controls: change status,
  assign owner, set priority, reply. Typed select controls (per admin-typed-controls).
- Add **Tickets** entry to the staff sidebar nav.

## Audit, migration, tests

- Audit: automatic — `SessionUpdatableService` records create/update. No extra work.
- Migration: `db:generate` produces the new-table migration from the schema (baseline
  is hand-maintained; this is an additive migration).
- Tests (live-DB harness): `tickets.service` — create+first-message, customer reply
  reopens resolved, status change writes system message + sets closedAt, and the
  authorization guard (customer cannot read another customer's ticket).

## Out of scope (YAGNI)

Attachments/file upload, email notifications (email is a separate future system per
project memory), SLA timers, CSAT ratings, catering-specific fields (the `catering`
category value exists now; its dedicated form lands when catering ships).
