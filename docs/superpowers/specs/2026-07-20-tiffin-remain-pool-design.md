# Tiffin remain pool, counts & vacation resume-from — Design

**Date:** 2026-07-20  
**Status:** Draft (design), pending user review  
**Scope:** `apps/tiffin-grab` customer `/me/deliveries`, `orders` / `deliveries` schema, `deliveries.service`, `orders.service` pause/resume, makeup/reconcile worker, vacation UI

**Related:** [2026-07-10-deliveries-lifecycle-design.md](./2026-07-10-deliveries-lifecycle-design.md), [2026-07-11-customer-delivery-calendar-design.md](./2026-07-11-customer-delivery-calendar-design.md)

## Problem

Customer `/me/deliveries` does not show **total** or **remaining** tiffins. Missed skips (“On Hold”) and vacation days past cutoff get **auto-appended makeup dates** at the end of the calendar — customers cannot choose when those tiffins land. Vacation **resume** is immediate (“now”) with no resume-from date; past undelivered vacation days are not presented as a schedulable pool.

## Goal

1. Show **total tiffins** and **remaining = total − delivered** (counts, not days) on the deliveries plan header.  
2. After cutoff, missed skip/vacation tiffins enter a **remain pool** instead of auto-scheduling.  
3. Customer schedules pool tiffins onto dates **only after the current last delivery**, on weekdays allowed by the subscription frequency (3-day / 5-day / everyday + Sat/Sun flags).  
4. Vacation **resume from a chosen day**: from that day forward, paused days become active again; vacation days already past move into the remain pool (end of subscription).

## Non-goals (v1)

- Changing paid `tiffin_count` / pricing / checkout.  
- Letting pool dates fill mid-calendar gaps (only after last delivery).  
- Staff-only admin rewrite of the pool (customers own scheduling; staff may use existing order tools later).  
- Migrating or rewriting already-created makeup rows in production (leave them as scheduled).  
- Changing pause **budget** limits (max pauses / days / stretch stay as today).

## Approach

**Remain-pool rows (Approach 1):** keep delivery rows as the schedule source of truth; add `orders.pooled_tiffin_count`; stop auto-makeup date creation; customer schedules from pool after last delivery.

---

## §1 Data model

### Entitlement

| Field | Meaning |
|-------|---------|
| `orders.tiffin_count` | Paid total tiffins (persons already included at checkout). Unchanged by pool/resume. |
| Delivered tiffins | Count from delivery rows treated as delivered (past cutoff / locked — same notion the calendar uses for “Delivered”). Each such **day** contributes `orders.persons` tiffins. |
| Remaining (display) | `tiffin_count − delivered_tiffins` (derived, never stored). |
| `orders.pooled_tiffin_count` | **New** integer ≥ 0: tiffins owed with **no calendar date yet**. |

### Invariant

```
delivered_tiffins + scheduled_future_tiffins + pooled_tiffin_count = tiffin_count
```

- `scheduled_future_tiffins` = pre-cutoff (or still upcoming) rows in `scheduled` (and any legacy makeup rows still upcoming), each × `persons`.  
- Terminal `skipped` / `paused` (post-cutoff miss) do **not** count as scheduled; their entitlement lives in the pool once reconciled.  
- `cancelled` rows do not count toward entitlement.

### Delivery rows

- Statuses unchanged: `scheduled | paused | skipped | cancelled`.  
- **No new day status** for “pooled” — pool is order-level only.  
- Optional: when scheduling from pool, set `makeup_for_delivery_id` to the original missed row for audit (nullable; at most one makeup per original remains).

### Migration

- Add `pooled_tiffin_count integer not null default 0` on `orders`.  
- Backfill: for each active/paused order, compute misses that already have makeup rows → pool stays 0 for those (makeup already scheduled). Misses without makeup → set pool from unrecovered miss count × persons (conservative; verify in implementation against live data).

---

## §2 UI (`/me/deliveries`)

### Plan header

Beside existing meal-size / category summary (`SubscriptionPlanSummary`):

- **Total:** N tiffins  
- **Remaining:** M tiffins  
- If `pooled_tiffin_count > 0`: **To schedule:** P tiffins  

### Vacation / Resume

- **Pause:** unchanged (start required, optional end, confirm scope).  
- **Resume:** when `hasOpenPause` or order `paused` — date field **Resume from** (app-settings timezone), then confirm.  
  - Service resumes from that calendar day forward.  
  - Past undelivered vacation days → pool (“To schedule”).

### On Hold (skip)

- Before cutoff: Skip / Un-skip as today.  
- After cutoff: day stays On Hold; tiffins move to pool (no auto end date).

### Schedule from pool

- Visible when pool &gt; 0: **Schedule tiffin** (header and/or day panel).  
- Date picker constraints:  
  - Strictly **after** current `max(delivery_date)` for the order.  
  - Weekday ∈ plan delivery days (frequency key + `includeSaturday` / `includeSunday`).  
- Confirm → one new `scheduled` day; pool decreases by `persons`; remaining unchanged (still undelivered).

### Legend

Unchanged: Delivered / Upcoming / Vacation / On Hold. Pool is header-only.

---

## §3 Server rules

### Cutoff

- Unchanged per-row `cutoffAt` (snapshotted; typically previous day in app timezone).  
- Pre-cutoff: skip ↔ unskip; resume-from can restore paused days still pre-cutoff.  
- Post-cutoff miss: leave row `skipped`/`paused`; add `persons` to `pooled_tiffin_count` **once** (idempotent).

### Replace auto-makeup

- `reconcileMakeups` (and worker path) **must not** create new delivery dates.  
- Replace with pool reconciliation: detect post-cutoff skipped/paused originals without an existing makeup **and** not yet counted into pool → increment `pooled_tiffin_count`.  
- Use a durable mark so double-runs do not double-count (e.g. activity row, or `pooled_at` / flag on the delivery — pick one in implementation; prefer a nullable `pooled_at` bigint on `deliveries` for clarity).

### Schedule from pool (server)

- Reject if `pooled_tiffin_count < persons`.  
- Reject if date ≤ current last delivery date.  
- Reject if weekday not in plan delivery set.  
- Insert `scheduled` row with normal address/cutoff snapshot; decrement pool by `persons`.  
- Revalidate `/me/deliveries`.

### Vacation resume-from-date

- Input: `resumeFromDate` (ISO date).  
- Require open pause and/or `orders.status === 'paused'` (fix partial-pause resume so open pause rows can resume without requiring full order pause — align UI and `resumeOrder`).  
- Unpause rows with `deliveryDate >= resumeFromDate` that are still pre-cutoff → `scheduled`.  
- Rows in the vacation window with `deliveryDate < resumeFromDate` that are paused and past cutoff → ensure pooled once.  
- Close open `subscription_pauses` (`resumed_at`); set order `active` when no remaining reason to stay paused.  
- Bounded vacation + `autoResumeIfElapsed`: still closes elapsed windows; any already-missed days must already be pooled by reconcile.

### Pause budgets

- Unchanged for creating vacation.  
- Scheduling from pool does **not** consume pause budget.

### Errors (customer-facing)

- “Cutoff passed”  
- “No tiffins left to schedule”  
- “Date must be after your last delivery”  
- “That day isn’t on your plan (…)”  

---

## §4 Key code touchpoints

| Area | Likely files |
|------|----------------|
| Schema / migration | `db/schema/orders.ts`, `db/schema/deliveries.ts`, new Flyway/Drizzle migration |
| Pool + schedule | `lib/services/deliveries.service.ts` (replace makeup create; add `scheduleFromPool`, `reconcilePoolFromMisses`) |
| Pause / resume | `lib/services/orders.service.ts`; customer `app/(customer)/me/deliveries/actions.ts` |
| Counts for UI | `lib/services/customer-deliveries.service.ts` (expose total, remaining, pooled) |
| Header UI | `subscription-items.tsx` / `SubscriptionPlanSummary` |
| Vacation UI | `vacation-control.tsx`, `vacation-pause.ts` |
| Worker | `workers/reconcile-deliveries.ts` (or equivalent) |
| Tests | Unit tests for pool invariant, schedule constraints, resume-from, idempotent reconcile |

## §5 Testing plan (acceptance)

1. Fresh subscription: header shows Total = Remaining = `tiffin_count`; To schedule = 0.  
2. Deliver / lock a day: Remaining decreases by `persons`; Total unchanged.  
3. Skip before cutoff → Un-skip: no pool change.  
4. Skip past cutoff: On Hold stays; To schedule += persons; no new calendar day until customer schedules.  
5. Schedule from pool: only dates after last delivery + valid weekdays; pool decreases; new Upcoming day appears.  
6. Vacation mid-plan, resume from a future day: days from resume active; past vacation misses in pool.  
7. 3-day vs 5-day plan: picker rejects disallowed weekdays.  
8. Reconcile worker twice: pool does not double-count.  
9. Existing makeup rows (if any): still appear as Upcoming; pool math still balances.

## §6 Rollout

1. Ship schema (`pooled_tiffin_count`, optional `pooled_at`) + backfill.  
2. Ship reconcile-to-pool (disable auto-makeup create) + customer schedule + header counts.  
3. Ship vacation resume-from-date.  
4. Verify on staging with a real 5-day and 3-day subscription before prod.

## Open decisions (resolved in brainstorm)

| Topic | Decision |
|-------|----------|
| Remaining definition | Total − delivered (tiffins, not days) |
| Pool placement | Only after current last delivery |
| Frequency | Adhere to plan delivery days |
| Approach | Remain pool (Approach 1), not auto-makeup reschedule-only |
| Resume | From chosen day; past undelivered → pool |
| Pre-cutoff | Customer can still un-skip / restore |
