# Admin user management + Better Auth RBAC (puchkaman, shared with tiffin-grab)

**Date:** 2026-08-10
**Status:** Approved, ready for implementation planning

## Problem

Neither app can create a user from the admin UI.

- **puchkaman** has `/dashboard/settings/users` — a plain table (name, email, role,
  status) with one action, suspend/reactivate, backed by `usersService.listAll` and
  `usersService.setStatus`. It cannot create a user, change a role, remove an account,
  or trigger a password reset. The only way to make an account is
  `apps/puchkaman/db/seed-admin.ts`, run by an operator with database access.
- **tiffin-grab** has `/dashboard/users` (list, set status, set role, edit contact,
  feature flags, admin-triggered OTP password reset) but no create path. Accounts
  only arrive through self-signup or checkout provisioning.

Authorization in both apps is a flat `role` string column (`admin` | `member` |
`user`, from `packages/commons/src/enums.ts`) checked by `createRoleGuards` in
`@realm/auth` and called as `await requireAdmin()` / `await requireStaff()` at the
top of each server action. There is no notion of a resource or an action, so any
new role means new guard functions and an audit of every call site.

Better Auth is already the auth layer in both apps (v1.6.20) but only the `emailOTP`,
`nextCookies`, and (puchkaman) `orderTracking` plugins are mounted. The `admin`
plugin and its access-control system are exactly the missing pieces.

## Decisions taken

| Question | Decision |
|---|---|
| `organization` plugin? | **No.** Neither app is multi-tenant. Adopt the `admin` plugin plus `createAccessControl` from `better-auth/plugins/access` — the same access-control engine `organization` uses, so organization can be layered on later without reworking permissions. |
| Ban vs `status`? | **`users.status` stays the single source of truth.** No ban endpoints, no second "cannot sign in" switch to drift out of sync. |
| How invited users get in? | **No password is ever issued.** Admin creates the account, the user receives the existing 6-digit email OTP and chooses their own password. Nothing is shared out-of-band. |
| RBAC depth? | **Resource/action statements, same roles to start.** Behaviour is unchanged on day one; a new role later becomes config rather than new guard functions. |
| Roles per app | **puchkaman is staff-only: `admin` and `member`.** Orders never provision a customer account there — guest checkout plus the `orderTracking` plugin covers that deliberately — so the `user` role has no meaning. tiffin-grab keeps all three, since checkout does provision customers. |
| Scope? | Shared primitives in `@realm/auth` and `@realm/crm`; puchkaman gets the full users surface; tiffin-grab gains only the missing invite dialog — its working page is not rewritten. |
| puchkaman soft-delete? | **In scope.** Bring puchkaman to tiffin-grab parity (`deleted` status + tombstoned contact + session revoke). |

## Constraints discovered

These are properties of the existing code that the design has to respect.

1. **Two id spaces.** `advanced.database.generateId: false`, `users.id` is a `bigint`,
   and `users.public_id` is the `usr_…` identifier. `getSession` in both apps
   normalizes `user.id` to the **publicId** (`apps/puchkaman/lib/auth/session.ts:28`),
   so everything above that boundary speaks `usr_…` while Better Auth below it speaks
   bigint. Any `auth.api.*` admin call must be passed the bigint, never the session's
   `id`, and must translate the result back.

2. **`passwordSet` is not a Better Auth field.** It is not declared in
   `user.additionalFields`, so no plugin endpoint can write it. It defaults `false` in
   puchkaman and `true` in tiffin-grab.

3. **Custom timestamp mapping.** `user.fields` maps Better Auth's `createdAt`/`updatedAt`
   onto `bauthCreatedAt`/`bauthUpdatedAt`; the house `created_at`/`updated_at` are
   bigint epoch-ms columns owned by `updatableColumns`.

4. **Status enum differs per app.** tiffin-grab is
   `["active","inactive","suspended","deleted"]`; puchkaman is
   `["active","inactive","suspended"]`.

5. **Sign-in gating already exists** in `databaseHooks.session.create.before` in both
   apps and rejects any status other than `active`. Nothing about that changes.

## Design

### 1. Access-control primitives — `@realm/auth`

Two new files.

`packages/auth/src/access.ts` — the statement fragment every CRM shares, merged with
Better Auth's own admin statements:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

export const crmStatements = {
  settings: ["read", "write"],
  audit: ["read"],
} as const;

export const baseStatement = { ...defaultStatements, ...crmStatements } as const;
export { createAccessControl, adminAc, defaultStatements };
```

Imports come from `better-auth/plugins/access` and `better-auth/plugins/admin/access`,
not `better-auth/plugins`, to keep the client bundle small.

`packages/auth/src/permission-guards.ts` — `createPermissionGuards(getSession, roles)`
returning `requirePermission(permissions)`. Authorization runs **locally** against the
role map, because `role` is already on the session; `auth.api.userHasPermission` would
add a request per check. Throws the same `AuthError` / `ForbiddenError` from
`@realm/commons` that `createRoleGuards` throws today.

`createRoleGuards` stays exported and unchanged.

### 2. Per-app permission map

`apps/puchkaman/lib/auth/permissions.ts`:

```ts
export const statement = {
  ...baseStatement,
  product: ["read", "write", "sync"],
  order:   ["read", "write", "refund", "cancel"],
  finance: ["read"],
  clover:  ["read", "connect"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  admin:  ac.newRole({ ...adminAc.statements, /* every app resource, every action */ }),
  member: ac.newRole({ product: ["read"], order: ["read", "write"], finance: ["read"] }),
};
```

puchkaman is staff-only. Orders there never create an account — guest checkout plus the
`orderTracking` plugin is the deliberate design — so there is no `user` role in the map
and `defaultRole` is `Role.MEMBER`, not `Role.USER`.

The `user` value stays in the `user_role` pg enum (removing an enum value is an
expensive migration for no gain) but is never assigned. The column's **default must
change from `'user'` to `'member'`** in the same migration: a row that somehow lands
without an explicit role would otherwise carry a role with no entry in the permission
map, and every permission check for it would miss. The invite action always sends an
explicit role regardless.

A file of the same shape lands in tiffin-grab with its own resources, keeping all three
roles — tiffin-grab's checkout does provision customer accounts.

`apps/*/lib/auth/guards.ts` keeps exporting `requireAdmin()` and `requireStaff()`,
reimplemented on top of `requirePermission`. Their existing call sites do not change.
New code uses `requirePermission` directly.

### 3. `admin` plugin — partial adoption

```ts
// puchkaman — staff only
admin({ ac, roles, defaultRole: Role.MEMBER, adminRoles: [Role.ADMIN] })
// tiffin-grab — customers exist
admin({ ac, roles, defaultRole: Role.USER,   adminRoles: [Role.ADMIN] })
```

Client side: `adminClient({ ac, roles })` in `apps/*/lib/auth/client.ts`.

**Used:** `createUser`, `setUserPassword`, `userHasPermission`, `listUserSessions`,
`revokeUserSessions`.

**Not used, each with a comment in the config saying why:**

- `banUser` / `unbanUser` — `users.status` is the single switch. Two independent
  "cannot sign in" flags is how someone gets un-suspended by accident.
- `removeUser` — hard delete, contradicts `softDelete`, which preserves the
  orders/payments/wallet rows that reference the user.
- `impersonateUser` — deferred. It needs its own audit story and a session field
  before it is safe to expose in a CRM holding customer PII.

**Migration.** The plugin declares `banned`, `banReason`, `banExpires` on the user
model and `impersonatedBy` on session. The drizzle adapter resolves fields against the
schema object, so omitting the columns risks a field-not-found at sign-in. Add all four
as nullable, and never write them. Nothing sets `banned`, so it can never go stale.

### 4. Invite flow

Server action `inviteUser({ email, name, role })`, admin-only:

1. `auth.api.createUser({ body: { email, name, role } })` — **no `password` field.**
   `password` is optional in the plugin's body schema, and when it is absent the plugin
   creates the user with *no credential account at all*
   (`dist/plugins/admin/routes.mjs`). So no password is generated, hashed, or discarded;
   there is simply nothing to leak until the user picks one.
2. `usersService.update(publicId, { passwordSet: false })` — the plugin cannot write
   this field (constraint 2). puchkaman already defaults it `false`; the patch is what
   makes the flow correct in tiffin-grab.
3. `auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } })` — the
   same mail `resetStaffPassword` already sends in tiffin-grab.

`/email-otp/reset-password` handles the credential-less user correctly: it creates the
credential account when none exists, and sets `emailVerified = true` on the way through
(`dist/plugins/email-otp/routes.mjs`). That second part matters for tiffin-grab, where
`requireEmailVerification` is on and the session hook rejects unverified users — an
invited user is verified by the act of completing the reset.

**Required new hook.** Set `passwordSet = true` when a reset completes, via
`emailAndPassword.onPasswordReset({ user })` — a first-class Better Auth option, rather
than matching `ctx.path` in `hooks.after`. Without it an invited user who completes the
reset is still `passwordSet: false` and the dashboard layout bounces them back to
`/set-password` forever.

The invite is audited through the existing `recordAudit` path, entity `auth`.

### 5. puchkaman schema parity and role narrowing

Migration (one new file; never rewrite an applied migration):

- Add `deleted` to the `user_status` enum.
- Change the `users.role` column default from `'user'` to `'member'`.
- Add the four unused Better Auth admin columns from section 3.

Two `Role.USER` fallbacks in puchkaman become `Role.MEMBER`, since `user` is no longer a
role that app grants:

- `apps/puchkaman/lib/auth/index.ts:62` — `user.additionalFields.role.defaultValue`
- `apps/puchkaman/lib/auth/session.ts:28` — `u.role ?? Role.USER`

Both are type-level fallbacks (`role` is `NOT NULL` in the schema), but leaving them
pointing at a role absent from the permission map turns any future null into a silent
permission miss rather than a loud one.

Soft-delete, ported from tiffin-grab:

- Port `usersService.softDelete` from tiffin-grab: revoke every session, set
  `status: "deleted"`, tombstone the email to `deleted-<publicId>@deleted.invalid` so
  the real address frees up for reuse while the column stays non-null and unique, and
  null the phone if puchkaman's users table carries one.
- Port `setStatus` so any non-active status revokes sessions. Without that, a suspension
  only blocks the *next* sign-in and leaves the current 30-day session running.
- Business rows are never hard-deleted.

### 6. UI

**Shared** — `packages/crm/src/user-invite-dialog.tsx`, exported from
`packages/crm/src/index.ts`. Fields: email, name, role select. The role list and the
submit server action arrive as props, so `crm-core` still imports no app (the slot-based
rule in AGENTS.md). Client component: the `"use client"` directive and named exports
including any `.Skeleton` must survive review, since `tsc` cannot catch either.

The role list is per-app: puchkaman passes `admin` and `member`. tiffin-grab passes the
same two — the invite dialog provisions *staff*, and a customer account is created by
checkout, not by an admin typing an email. `user` is never an invitable role in either
app, even though tiffin-grab's permission map still defines it.

**puchkaman** — extend the existing `/dashboard/settings/users` page rather than build
a new one. It already lists accounts and suspends them. It gains: an Invite button in
the `PageHeader` actions slot, a role control per row, Remove (soft-delete), and Send
password reset. No facet-filter framework — a staff roster is a handful of rows, and
`listAll` already orders them.

**tiffin-grab** — the shared invite dialog drops into the existing page. Nothing else
is rewritten.

The users list is deliberately **not** extracted into `@realm/crm`. tiffin-grab's is
tangled with feature flags, customer columns, and sort state; puchkaman's is a plain
staff roster. Per AGENTS.md, code graduates to a package when a second client proves it
is genuinely shared, and these two lists are not yet the same list. The invite dialog
is, which is why that one moves.

### 7. Error handling

- Duplicate email on invite → `ValidationError("That email is already in use")`, not a
  raw 23505. `usersService.assertFree` already has this shape.
- OTP send failure after the user row is created → the account exists and is usable via
  the users list's existing "send password reset" action. The action surfaces the
  failure rather than rolling back the user, so a transient SES error does not silently
  discard an admin's work.
- Server actions **return** errors rather than throwing; a thrown error in a Next.js
  server action reaches the client as an opaque digest.

## Verification

- `@realm/auth`: unit tests for the permission guards — role × permission → allow/deny,
  and that `requireAdmin` grants and denies exactly what it did before.
- puchkaman: invite action test — user created, `passwordSet: false`, OTP requested,
  non-admin caller rejected, duplicate email rejected.
- puchkaman: `softDelete` test — status `deleted`, email tombstoned, sessions gone.
- `pnpm turbo typecheck && pnpm turbo test`.
- By eye, per AGENTS.md: `"use client"` intact on the invite dialog, and no client
  symbol demoted from a named export.

## Out of scope

- The `organization` plugin, tenants, teams, invitation tables.
- Impersonation.
- Migrating tiffin-grab's users list to a shared component.
- New named roles beyond admin/member/user. The statement layer is what makes adding
  one cheap later; deciding what a "kitchen" or "support" role may do is a product
  question, not this change.
