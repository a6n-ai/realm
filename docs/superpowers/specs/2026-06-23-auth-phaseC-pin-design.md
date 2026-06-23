# Phase C — PIN Re-unlock (Design)

**Date:** 2026-06-23
**Branch:** fast-follow/slice4-order-mgmt
**Status:** Approved — ready for plan
**Parent spec:** `docs/superpowers/specs/2026-06-22-crm-auth-profile-design.md` §Phase C
**Predecessors:** Phase 0 (Better Auth migration), Phase A (signup/reset/verify), Phase B (profile/avatar/tabs) — all complete + merge-ready.

## 1. Summary

App-level convenience re-unlock of an **already-authenticated** session via a 4-digit PIN. The PIN is **not** a Better Auth credential and never substitutes for a cold login. A locked session (idle timeout or manual lock) shows a `/lock` screen; entering the correct PIN clears the lock. Repeated failure forces a full password re-login.

## 2. Decisions (resolved during brainstorming)

| Question | Decision |
|----------|----------|
| Lock trigger | **Both** — 15-min idle timeout AND a manual Lock button, sharing one `/lock` screen + `verifyPin` path. |
| Lockout policy | **5 wrong PINs → signOut → `/login`** (force full password login). No timed-lock column. |
| PIN mutation re-auth | **Require current account password** for set / change / remove (verified server-side via Better Auth). |
| Enforcement point | **Dashboard layout** (existing guard seam), **not** middleware — the codebase has no `middleware.ts`; Phase 0 guards at the layout/page level. |

## 3. Architecture

### 3.1 Schema (`apps/web/db/schema/`, drizzle migration)
Add to `users`:
- `pin_hash text` (nullable — null = no PIN set)
- `pin_attempts integer not null default 0`

**Drop `pin_locked_until`** from parent spec §2.2: the force-password-at-5-fails decision makes a timed-lock timer dead code (YAGNI). No new tables.

### 3.2 Validation (`@tiffin/commons`)
`pinSchema`: a string of **exactly 4 digits** (`/^\d{4}$/`), rejecting trivial PINs:
- all-same (`0000`, `1111`, … `9999`)
- ascending sequential (`0123`, `1234`, … `6789`)
- descending sequential (`9876`, … `3210`, `1098`-style wrap NOT required — only straight runs)

User-facing messages mirror the `passwordSchema` style. Reuses nothing else; exported alongside `passwordSchema`.

### 3.3 Service (`UsersService` subclass — audited, commons abstract pattern)
PIN columns stay **out** of the generic writable allowlist; only dedicated methods touch them. All mutations route through the audited `super.update` seam (same pattern as `updateProfile`).

- `setPin(userId, currentPassword, newPin)` — verify `currentPassword` server-side via Better Auth; bcrypt-hash `newPin` → `pin_hash`; reset `pin_attempts=0`. **Set and change are one method** — "change" is simply `setPin` when a `pin_hash` already exists; the Security form chooses the label.
- `removePin(userId, currentPassword)` — verify `currentPassword`; set `pin_hash=null`, `pin_attempts=0`.
- `verifyPin(userId, pin) → { ok: boolean; forcePassword?: boolean }` — bcrypt-compare against `pin_hash`:
  - correct → reset `pin_attempts=0`, return `{ ok: true }`.
  - wrong → increment `pin_attempts`; if it reaches **5** → reset `pin_attempts=0`, return `{ ok: false, forcePassword: true }` (caller signs out + redirects `/login`); else `{ ok: false }`.
  - no `pin_hash` → `{ ok: false }` (cannot verify; UI should not have reached `/lock` for a PIN-less user, but fail closed).

Password verification reuses the same Better Auth credential check that backs `change-password` (bcrypt account password); no plaintext stored or logged.

### 3.4 Lock state + enforcement (no middleware)
- **Lock cookie** `tg_locked` — httpOnly, set by server action `lockSession()`, cleared on successful `verifyPin`. Presence ⇒ "show `/lock`".
- **Dashboard layout** (`app/(dashboard)/dashboard/layout.tsx`, server component — the existing guard seam):
  1. existing `getSession` guard unchanged.
  2. read `tg_locked` cookie (read-only — allowed during render) → if present, `redirect("/lock")`.
  3. one narrow read of `hasPin` (`pin_hash IS NOT NULL` for the session user) → pass to sidebar (gate the Lock button) and to `<IdleLock>`.
- **Idle (15 min)** — client `<IdleLock thresholdMs={15*60_000}>` mounted in the layout **only when `hasPin`**. Resets a timer on user interaction (pointer/key/visibility); on fire calls `lockSession()` then navigates `/lock`. Idle is a browser concept — a client timer is the correct tool and sidesteps Next's prohibition on cookie writes during server-component render.
- **Manual Lock button** — in the sidebar near sign-out, rendered only when `hasPin`; calls `lockSession()` → `/lock`.
- **`/lock` route** — its own `getSession` guard (no session → `/login`). PIN entry form (4-digit, masked) → server action wrapping `verifyPin`:
  - `{ ok: true }` → clear `tg_locked` → `redirect` back to dashboard.
  - `{ ok: false, forcePassword: true }` → `signOut` → `/login`.
  - `{ ok: false }` → inline error ("Incorrect PIN"), stay.
  - "Sign in with password instead" link → `signOut` → `/login`.

### 3.5 UI — Security tab `PinSection`
Added to the Phase B account **Security** tab. Set / change / remove forms (react-hook-form + zod), reusing the `change-password-form` shape: current-password field + new-PIN (`pinSchema`) + confirm-PIN (refine match), show/hide toggles, sonner toasts, generic error on bad password. State reflects whether a PIN is currently set (set vs change/remove affordances).

## 4. Error handling
- **No enumeration concern** — all PIN ops require an authenticated session for the session's own user; no identifier lookup.
- **Re-auth** — set/change/remove all gated on the current account password; a hijacked *unlocked* session cannot silently take over the PIN.
- **Fail closed** — `verifyPin` with no `pin_hash`, or `/lock` with no session, both degrade to password login rather than granting access.
- **Force-password reset** — on 5th failure the session is signed out and `pin_attempts` reset so the next login starts clean.
- **No secrets logged** — PIN and password never logged or returned in responses.

## 5. Testing
- `pinSchema` — accepts valid 4-digit PINs; rejects non-4-digit, non-numeric, all-same, ascending/descending sequential.
- `verifyPin` — correct resets attempts; wrong increments; 5th wrong returns `forcePassword` + resets attempts.
- `setPin`/`removePin` — wrong password rejected (no write); correct password writes/clears `pin_hash`.
- Guard parity — `requireStaff`/`requireAdmin` and existing layout guard behavior unchanged by the lock addition.
- (Manual runbook — dev-server/DB dependent: set PIN, lock manually + via idle, unlock, 5-fail force-password, remove PIN.)

## 6. Build order
schema + `pinSchema` → service methods (`setPin`/`removePin`/`verifyPin`) → lock cookie + `/lock` route + layout wiring → `<IdleLock>` + Lock button → Security `PinSection` → gate (typecheck / vitest / lint / build). Each step behind the prior, mirroring Phase A/B task cadence.

## 7. Cross-cutting
Apply `better-auth-security-best-practices` (credential re-verification), `vercel-react-best-practices` (IdleLock effect/listener hygiene), and the `shadcn` skill for any new form primitives. bcryptjs reused from the Phase 0 password path.
