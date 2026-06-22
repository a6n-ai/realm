# CRM Auth + Profile — Design Spec

**Date:** 2026-06-22
**Status:** Approved (pending spec review)
**Scope:** Migrate authentication from NextAuth v5 to Better Auth, add the full set of login/account flows (signup, logout, password reset/set, email verification, 4-digit PIN re-unlock), and extend the user profile with avatar upload.

---

## 1. Goal & Context

The CRM (`apps/web`, Next.js) currently runs on **Auth.js / NextAuth v5 (beta)** with a Credentials provider, JWT sessions, and a single working `/login` page. It lacks signup, logout, password reset, email verification, PIN convenience login, and profile avatar upload.

**Decision:** Replace NextAuth entirely with **Better Auth**. Use Better Auth's framework for all authentication. Build the missing flows on top of it, plus a profile/avatar section.

### Locked decisions
- **Framework:** Better Auth only. NextAuth is fully removed.
- **DB adapter:** `@better-auth/drizzle-adapter` (provider `pg`), mapped onto existing tables, `generateId: false` to preserve the bigint `next_id()` PK + `publicId` boundary and all foreign-key references.
- **Customer credential:** `phoneNumber` plugin — customers sign up / sign in with **phone + password**. Email is optional. Phone OTP verification is **stubbed** (log code to console) until SMS exists.
- **Staff credential:** email + password (Better Auth core email/password).
- **Data:** migrate in place. Move `users.password_hash` → Better Auth `account.password`. Custom `password.verify` uses **bcryptjs** so existing seeded logins keep working; optional rehash-on-login.
- **Roles:** keep custom `role` enum (`admin`/`member`/`user`) as a Better Auth `additionalFields` user field; keep existing `requireStaff` / `requireAdmin` guards (re-pointed at the new session).
- **Email/SMS sending:** none yet. Reset/verify links and OTP codes are logged to console via Better Auth callbacks; swap in a provider later with no flow changes.
- **PIN:** app-level convenience re-unlock of an already-authenticated session — NOT a Better Auth credential. 4 digits.
- **Avatar storage:** storage abstraction with a local-disk stub now; swap to Vercel Blob / S3 / R2 later without touching forms or actions.

### Non-goals (YAGNI)
- Real email/SMS delivery (stubbed).
- 2FA / passkey / social providers (Better Auth plugins, deferred — but the migration leaves them one plugin away).
- Better Auth admin/organization plugin (keeping custom role guards).
- Customer-tier / activity badges (only avatar + role/verification status surfaced).

---

## 2. Architecture

### 2.1 Better Auth server config (`apps/web/lib/auth/`)
- `betterAuth({ ... })` with:
  - `database: drizzleAdapter(db, { provider: "pg", schema: { ...schema, user: users, session, account, verification } })`
  - `advanced: { database: { generateId: false } }` — let Postgres `next_id()` fill `users.id`.
  - `emailAndPassword: { enabled: true, password: { hash, verify } }` where `verify` detects and checks legacy bcryptjs hashes (and Better Auth's own for new ones); `hash` uses bcryptjs for consistency.
  - `user: { additionalFields: { role: { type: "string", defaultValue: "user", input: false }, publicId: ... } }` (publicId already exists; expose role on session).
  - `plugins: [phoneNumber({ sendOTP, signUpOnVerification? }), nextCookies()]`.
  - `emailVerification: { sendVerificationEmail }` → stub logs link.
  - `emailAndPassword.sendResetPassword` → stub logs link.
  - `session`: DB-backed, cookie. Configure `expiresIn` (e.g. 30d to match prior maxAge).
- `lib/auth/client.ts`: `createAuthClient` with `phoneNumberClient()` etc. for client forms.
- Route handler: `app/api/auth/[...all]/route.ts` → `toNextJsHandler(auth)`. Remove `app/api/auth/[...nextauth]/route.ts`.

### 2.2 Schema changes (`apps/web/db/schema/`, drizzle migration)
- **Keep** `users` (bigint `id`, `publicId`, `name`, `email`, `emailVerified`, `phone`, `role`, `image`, audit cols).
- **Add Better Auth tables** (mapped, pg): `session` (id, userId→users.id, token, expiresAt, ipAddress, userAgent, timestamps), `account` (id, userId, providerId, accountId, password, tokens…, timestamps), `verification` (id, identifier, value, expiresAt, timestamps). Reconcile with the existing NextAuth `accounts`/`sessions`/`verification_tokens` tables: reuse if shape-compatible, otherwise add new and drop old after migration.
- **Add to `users`:** `phoneNumberVerified boolean` (phoneNumber plugin), `pin_hash text`, `pin_attempts integer default 0`, `pin_locked_until bigint`.
- **Data migration step:** for each user with a non-null `password_hash`, insert an `account` row (`providerId="credential"`, `accountId=user.id`, `password=password_hash`). Then drop `users.password_hash` (or keep nullable during transition). Document as an explicit, reversible migration.

### 2.3 Session access & guards (`apps/web/lib/auth/`)
- Replace `auth()` usage with a thin server helper `getSession()` → `auth.api.getSession({ headers: await headers() })`, returning `{ user: { id: publicId, role } }`-shaped object so call sites change minimally.
- `middleware.ts`: session check via Better Auth cookie; also the PIN `/lock` redirect (Phase C).
- `guards.ts`: `requireStaff` / `requireAdmin` / `requireRole` read role from the new session. Behavior preserved; existing guard tests updated to the new session shape.

### 2.4 Services (commons abstract pattern preserved)
- Auth credential operations (signup, signin, reset, verify) go through **Better Auth API** — not the service layer.
- Profile/contact/PIN mutations stay in `UsersService` (subclass overriding `create`/`update` calling `super`, with audit), e.g. `updateProfile({ name, image })`, `setPin`/`verifyPin`/`clearPin`. PIN columns stay out of the generic writable allowlist; dedicated methods only.

### 2.5 Validation (`@tiffin/commons`)
- Add `passwordSchema` (min length, complexity policy) and `pinSchema` (exactly 4 digits, reject trivial: `0000`, `1234`/sequential, all-same). Reuse existing `phoneSchema()` / `emailSchema`.

---

## 3. Feature Flows

### Phase 0 — Migration to Better Auth (parity)
**Outcome:** login + role guards behave exactly as before, on Better Auth.
1. Install `better-auth` + `@better-auth/drizzle-adapter`; remove `next-auth`, `@auth/drizzle-adapter`.
2. Add Better Auth server/client config + route handler.
3. Schema migration (session/account/verification tables, new user columns) + data migration (password_hash → account).
4. Custom bcryptjs `verify`/`hash`.
5. Rewrite `getSession`, `middleware.ts`, `guards.ts`.
6. Rebuild `/login` form against the Better Auth client (email-or-phone + password).
7. **Gate:** existing seeded admin/staff/customer can log in; role-gated pages + sidebar filter correctly; guard tests pass.

### Phase A — Signup, logout, password reset/set, email verify
- `/signup` (public): customer = phone + password (+ optional email, name) via `phoneNumber` plugin sign-up; staff path via email + password. Auto sign-in on success. Trivial/duplicate handling.
- Logout: server action → Better Auth `signOut`; button in account + sidebar.
- `/forgot-password`: enter identifier → `requestPasswordReset` → **stub logs reset link**. Generic response (no user enumeration).
- `/reset-password` (token): set new password → Better Auth `resetPassword`. Same screen serves initial-set (null-credential users).
- `/verify-email` (token): Better Auth email verification → sets `emailVerified`; "resend" action from account.
- Phone OTP verify: `phoneNumber.verify` with **stubbed OTP** (logged).

### Phase B — Profile + avatar + account tabs
- Account page → shadcn **Tabs**: **Profile** (avatar + editable `name`), **Contact** (existing phone/email form + verify-status badge), **Security** (change password, PIN setup).
- Avatar component: shadcn `Avatar` with **initials fallback**, `react-easy-crop` square crop, client validation (jpg/png/webp, ≤2 MB), server-side downscale, **remove** button.
- `lib/storage/`: `interface StorageDriver { put(key, bytes, contentType): Promise<string>; delete(key): Promise<void> }` + `LocalStorageDriver` writing to `public/uploads/avatars/`. Selected via env/config.
- Server actions: `updateMyProfile`, `updateMyAvatar`, `removeMyAvatar` → write `users.image` through `UsersService`.

### Phase C — PIN re-unlock
- Set/change/remove 4-digit PIN in Security tab. `pinSchema` validation; bcryptjs `pin_hash`.
- `/lock` screen: when a valid session is idle-locked (cookie flag / last-activity threshold), `middleware.ts` redirects there.
- PIN entry verifies against the current session user's `pin_hash`. Success clears the lock; **requires an existing valid session** (not a cold login).
- Lockout: 5 failures → set `pin_locked_until` (exponential backoff) → fall back to full password login. Reset trivial-PIN guard on set.

---

## 4. Error Handling
- **User enumeration:** forgot-password + signup return generic messages; never reveal whether an identifier exists.
- **Rate limiting:** use Better Auth's built-in rate limiting for auth endpoints; DB-counter backoff for PIN.
- **Tokens:** Better Auth manages reset/verify token lifecycle (hashed, single-use, expiring). OTP + reset links are logged (stub), never returned in responses.
- **Validation:** client (react-hook-form + zod) and server (schemas + Better Auth) both enforce; sonner toasts on failure.
- **Avatar:** reject oversize/wrong-type before upload and again server-side; orphaned-file cleanup on replace/remove.
- **Stale sessions:** account/profile pages tolerate a session whose user was deleted (redirect to login).

## 5. Testing
- Custom bcryptjs `verify` accepts legacy hashes and new ones.
- Password + PIN zod schemas (including trivial-PIN rejection).
- PIN verify + lockout/backoff behavior.
- Guard parity (`requireStaff`/`requireAdmin`) against the new session shape.
- Reset/verify flows: token issuance logged, consumed once.
- Storage driver: local put/delete round-trip; oversize/type rejection.

## 6. Build Order
Phase 0 → A → B → C. Each phase is independently shippable behind the prior gate. Phase 0 must reach login parity before A starts.

## 7. Cross-cutting
- Apply `better-auth-best-practices`, `better-auth-security-best-practices`, `email-and-password-best-practices`, `vercel-react-best-practices`, and the `shadcn` skill/MCP during implementation.
- Server Components for pages; Client Components only for interactive forms; mutations via server actions / Better Auth API. No secrets to the client.
- Better Auth MCP + the 6 Better Auth skills are installed; they become active next session (registered mid-session).
