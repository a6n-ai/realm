# Inquiry CRM Revamp — Design Spec

**Date:** 2026-06-24
**Scope:** Revamp the inquiry → activity → order-conversion lifecycle. Add owner/actor
tracking across all tables, typed follow-up touchpoints, a lead-assignment rules engine,
and sortable tables app-wide.

## Goals (all four, per product owner)

1. **Follow-up discipline** — typed touchpoints (call/whatsapp/email/note) with outcomes and a
   scheduled next-action date; overdue follow-ups surface in the pipeline.
2. **Pipeline visibility** — owner per inquiry, last-touch / next-action columns, filters
   (enhanced **table**, no kanban).
3. **Faster intake** — capture optional plan/diet/area/persons/start/budget interest at intake;
   dedup to an existing customer by phone/email. Source + sub-source are **admin-configurable**
   (e.g. source `facebook` → sub-sources `facebook_feed`, `facebook_ads`; source `instagram` →
   `instagram_reels`), not a hardcoded enum.
4. **Conversion quality** — inline conversion drawer with RHF+zod, postal→zone auto-match,
   prefill from intake prefs, dedup-to-existing-customer.

## Non-goals

- Kanban board (explicitly declined — table only).
- Outbound notifications/email/push for reminders (in-app overdue surfacing only).
- Touching pure Better-Auth-managed tables (`session`/`account`/`verification`).

---

## Key correction discovered during design

`created_by` / `updated_by` columns **already exist** in `@tiffin/commons-drizzle`
(`baseColumns`/`updatableColumns`) and are already listed in `MANAGED_FIELDS`. They are
**never populated** — `sessionActorId()` resolves the acting user but only writes
`audit_log.createdBy`, not the row's own columns. Therefore:

- No new `created_by`/`updated_by` columns and **no baseline reset for them**.
- The fix is one stamping line each in `SessionBaseService.create` and
  `SessionUpdatableService.update`. It applies to every table using the mixins automatically.
- Baseline reset is required only for genuinely new columns (owner, pool flags, activity
  fields, prefs, lost reason).

`inquiries.assignedTo` already exists and references `users.id` — it **is** the owner column;
it will be **renamed** to `currentOwner`, not added.

---

## Flow map

```
INTAKE ─────────────► ASSIGNMENT ──────► ACTIVITY / FOLLOW-UP ──────► CONVERSION ──► ORDER
manual (staff)         owner = creator    typed touchpoints:           inline drawer   currentOwner
inbound (web/fb/       ─ or ─ (Phase 2)   call/whatsapp/email/note     RHF + zod        createdBy
google/referral)       rules engine:      + outcome + nextFollowUpAt   postal→zone ✓    (carried from
+ optional prefs       round-robin /      stage moves logged           dedup customer   inquiry)
                       percentage over    overdue surfaces in table    prefill prefs
                       acceptsLeads pool   lost → reason enum + note
                       → default pool
                       → system user
```

---

## Data model

### Foundation (commons-drizzle + session services)

- `SessionBaseService.create`: stamp `createdBy: await currentUserId()` into the row.
- `SessionUpdatableService.update`: stamp `updatedBy: await currentUserId()` into the patch.
  - `createdBy` is create-only (already protected by `CREATE_ONLY_FIELDS`); never reassigned on update.
- Stamping is best-effort: `null` actor (scripts/tests/no session) leaves the column null — same
  contract as the existing audit seam.

### `users` (extend; already custom-extended)

| Column | Type | Notes |
|---|---|---|
| `acceptsLeads` | boolean default false | eligible for inbound lead assignment |
| `inDefaultPool` | boolean default false | fallback pool (admins allowed) |

**System user seed:** `usr_system`, role `admin`, no password / no pin → cannot log in. Final
assignment fallback. Seeded idempotently in `seed-admin.ts`.

### `lead_sources` / `lead_subsources` (new reference tables — replace the `inquiry_source` enum)

Source + sub-source become **data-driven**, admin-managed (no pgEnum). Sub-source is a child of
source (e.g. facebook → facebook_feed / facebook_ads; instagram → instagram_reels).

**`lead_sources`** (`updatableColumns("lsr")`)

| Column | Type | Notes |
|---|---|---|
| `key` | text unique | stable slug (e.g. `facebook`) |
| `label` | text | display name |
| `isInbound` | boolean default true | inbound sources trigger auto-assignment; `manual` = false |
| `active` | boolean default true | soft-delete (TD-3 catalog pattern) |

**`lead_subsources`** (`updatableColumns("lss")`)

| Column | Type | Notes |
|---|---|---|
| `sourceId` | bigint → lead_sources.id | parent source |
| `key` | text | unique per source |
| `label` | text | display name |
| `active` | boolean default true | soft-delete |

**Seed (Phase 0):** `manual` (isInbound=false), `referral`, `website`, `google`, `facebook`
(+ `facebook_feed`, `facebook_ads`), `instagram` (+ `instagram_reels`). Intake (Phase 1) depends
on these existing; the admin CRUD UI is Phase 2.

### `inquiries`

| Column | Change | Type | Notes |
|---|---|---|---|
| `assignedTo` | **rename** → `currentOwner` | bigint → users.id | reassignable owner |
| `source` | **replace enum** → `sourceId` | bigint → lead_sources.id | configurable source |
| `subSourceId` | add | bigint → lead_subsources.id null | configurable sub-source |
| `planInterest` | add | text null | prefills conversion plan |
| `mealSizeInterest` | add | text null | prefills meal size/diet |
| `personsInterest` | add | integer null | prefills persons |
| `postalCode` | add | text null | drives zone match at intake |
| `zoneId` | add | bigint → zones null | resolved from postal |
| `preferredStart` | add | date null | prefills order start date |
| `quotedPrice` | add | numeric(10,2) null | negotiation context |
| `lostReason` | add | enum null | see below |
| `prefs` | **drop** | — | replaced by typed columns above |
| `createdBy` | (already on mixin) | — | now actually stamped |

`inquiry_lost_reason` enum: `price`, `out_of_zone`, `no_response`, `chose_competitor`,
`not_ready`, `other`.

### `orders`

| Column | Change | Type | Notes |
|---|---|---|---|
| `currentOwner` | add | bigint → users.id null | carried from inquiry on convert |
| `createdBy` | (already on mixin) | — | now actually stamped |

### `inquiry_activities`

- Extend `inquiry_activity_type` enum: add `call`, `whatsapp`, `email`. (Existing:
  `created`, `note`, `stage_change`, `converted`.)
- Add `outcome text null`, `nextFollowUpAt bigint null` (epoch-ms).
- **Overdue rule:** an inquiry is overdue when its latest activity's `nextFollowUpAt` is in the
  past and no newer activity exists. Computed in the list query, not stored.

### `app_settings` (singleton) — Phase 2

- Add `leadAssignment jsonb`:
  `{ strategy: 'creator'|'round_robin'|'percentage', perSource?: Record<source, strategy>,
     weights?: Record<userId, number>, cursor?: Record<source, userId> }`.

---

## Assignment algorithm

Implemented in `inquiriesService.create` via a `resolveOwner(source, creatorId)` helper. The
trigger is the source's `isInbound` flag: **inbound sources always run assignment**; `manual`
(isInbound=false) assigns to the creator.

1. **Phase 1 (simple):** `manual` → owner = session actor (creator). Any inbound source → no
   creator context, so → `usr_system`. Reassignable via owner dropdown.
2. **Phase 2 (rules engine):**
   - `isInbound=false` (manual) → creator.
   - `isInbound=true` → eligible pool = `acceptsLeads=true` (optionally filtered per source) →
     apply `strategy`:
     - `round_robin`: advance stored `cursor[source]` over the sorted eligible pool.
     - `percentage`: weighted pick by `weights` (deterministic seed from inquiry id; no
       `Math.random` reliance for testability).
   - Empty pool → `inDefaultPool=true` users.
   - Still empty → `usr_system`. **Never null.**

---

## UI / UX (shadcn + impeccable)

All new UI uses existing shadcn primitives already in the repo (`Sheet`, `Select`, `Form`,
`Badge`, `Command`, `Switch`, `Input`, `Table`/`ds/` components). No new dependencies.

### Inquiry intake (Sheet) — extend existing `AddInquirySheet`
- Keep RHF+zod. **Source** `Select` → **Sub-source** `Select` (dependent, filtered to the chosen
  source's active sub-sources; hidden when the source has none). Both load from `lead_sources`/
  `lead_subsources`.
- Add a collapsible **"Interest (optional)"** section: plan, meal size/diet,
  persons, postal (→ live zone badge via `matchZone`), preferred start, quoted price.
- Out-of-zone postal shows a muted "out of delivery area — waitlist" hint, non-blocking.

### Inquiry detail — activity timeline
- Replace flat `ListRow` feed with a **typed timeline**: icon per type (phone/whatsapp/mail/
  note/arrow), outcome line, and a "↳ Next: <type> on <date>" affordance.
- **Log activity** control: type select → outcome text → optional "schedule next follow-up"
  date. Single server action.
- **Mark lost** opens a small dialog: reason `Select` + optional note.
- Owner shown as an assignable `Select` (avatar + name).

### Conversion — inline drawer (replaces `/order` route)
- `Convert ▸` on detail opens a `Sheet` drawer; migrate `order-form.tsx` from `useState` to
  RHF+zod. Prefill plan/size/persons/start/postal from inquiry prefs.
- Postal `Input` → live zone resolution + invoice preview (existing `previewPrice`).
- **Dedup banner:** on open, look up existing customer by inquiry phone/email; if found show
  "Existing customer? <name> [link order to them]".
- Submit → `inquiriesService.convert` (carries `currentOwner`, stamps `createdBy`).

### Enhanced inquiry table (pipeline)
- Columns: name, owner, stage badge, source, last-touch (relative), next-action (with overdue
  badge), created. Filters: stage, owner ("my inquiries"), overdue, source. Bulk reassign.

### Sorting (Phase 3, all tables)
- URL `searchParams`-driven (`?sort=col&dir=asc`) — server components read params, no client
  state, shareable. Shared `<SortableHeader>` in `ds/`. Applied to inquiries, orders,
  customers, dishes, menus.

---

## Vercel / Next.js best practices

- Server Components by default; data fetched server-side in page components.
- Mutations via **server actions** (`requireStaff` guard, as today); `revalidatePath` instead
  of full `router.refresh()` where it tightens the update.
- Filtering/sorting state lives in **URL `searchParams`**, not client state — server reads and
  re-queries. Cacheable, shareable, back-button-correct.
- Conversion price preview stays a server action (pricing is server-only per TD-2).
- Read the relevant guide under `node_modules/next/dist/docs/` before writing (per AGENTS.md —
  this is not stock Next.js).

---

## Build order (phases)

**Phase 0 — Foundation**
- Stamp `createdBy`/`updatedBy` in session services.
- `users`: add `acceptsLeads`, `inDefaultPool`; seed `usr_system`.
- New `lead_sources` / `lead_subsources` tables; drop `inquiry_source` enum; seed default
  sources + sub-sources (facebook/instagram/google/website/referral/manual).
- `inquiries`: rename `assignedTo`→`currentOwner`; replace `source` enum → `sourceId` FK +
  `subSourceId`; add prefs columns + `lostReason`; drop `prefs`.
- `orders`: add `currentOwner`.
- `inquiry_activities`: enum additions + `outcome` + `nextFollowUpAt`.
- Regenerate the squashed baseline migration (hand-maintain `next_id()` preamble per house rule).

**Phase 1 — Intake + Activity + Conversion revamp**
- Optional intake prefs + live zone badge.
- Typed touchpoints + next-action + overdue; mark-lost dialog.
- Conversion inline drawer: RHF+zod, prefill, zone match, dedup banner.
- Simple owner: auto-assign creator + manual reassign + system fallback.
- Enhanced inquiry table (filters, owner, last-touch/next-action).

**Phase 2 — Lead sources admin + assignment rules engine**
- Admin CRUD for `lead_sources` / `lead_subsources` (typed editor, TD-3 pattern; reuse the
  `resource-config` admin editor): add/rename/retire sources and sub-sources, toggle `isInbound`.
- `app_settings.leadAssignment` config UI (admin): strategy per source, round-robin/percentage,
  weights.
- `acceptsLeads` / `inDefaultPool` management in users admin.
- `resolveOwner` runs on inbound inquiry create.

**Phase 3 — Sorting (cross-cutting)**
- Shared `<SortableHeader>` + whitelisted `orderBy` in commons `parseListParams`/`Query`.
- Apply to all data tables.

---

## Testing

- Service tests: `createdBy`/`updatedBy` stamped from session actor; null-actor leaves null.
- Assignment: creator path, round-robin cursor advance, percentage weighting determinism,
  empty-pool → default-pool → system-user fallback chain.
- Activity: overdue computation; next-follow-up scheduling; lost-reason capture.
- Conversion: prefill from prefs; postal→zone match; dedup detection; owner carried to order.
- Source/sub-source: dependent select filtering; inbound vs manual assignment trigger via
  `isInbound`; sub-source FK constrained to its parent source.
- Sorting: whitelisted columns only (no SQL injection via `sort` param); dir asc/desc.
- Follow existing patterns in `apps/web/lib/services/__tests__/`.

## Risks / caveats

- **Baseline reset** rewrites the single squashed migration — coordinate with any pending DB
  state; the `next_id()` preamble is hand-maintained (per project memory).
- Dropping `prefs` jsonb: no production data depends on it yet (field is unused in UI). Confirm
  before drop; otherwise migrate forward.
- Better-Auth tables excluded from owner/actor columns by design.
