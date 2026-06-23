# Phase A — Signup, Logout, Password Reset/Set, Email Verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On the now-migrated Better Auth foundation, deliver the remaining auth flows: public customer signup (phone-first), logout, password reset/set, and email verification — with real UI on the previously-stubbed callbacks.

**Architecture:** Better Auth client (`@/lib/auth/client`) drives all flows. Customers sign up phone-first via the phoneNumber plugin's OTP→setPassword sequence (OTP stubbed → logged). Password reset is dual-path: email users get a reset link (`requestPasswordReset`/`resetPassword`), phone-only users reuse the OTP→setPassword flow. Email verification uses Better Auth's `sendVerificationEmail` + verify link (also stubbed → logged). New auth pages live under `app/(auth)/`, mirroring the committed `login-04` split-card style.

**Tech Stack:** Better Auth 1.6.20 (`phoneNumber` plugin, email/password), Next.js 16 App Router, React 19, react-hook-form + zod, shadcn, vitest (+ jsdom for form tests).

## Global Constraints

- **pnpm only.** `pnpm --filter web exec vitest run <path>`, `pnpm --filter web typecheck/lint/build`. Never npm/npx.
- **No email/SMS provider yet.** Reset links, verification links, and phone OTP codes are `console.info`-logged via the existing config callbacks — never returned in responses or shown to the user.
- **No user enumeration.** Forgot-password + signup return generic messages; never reveal whether an identifier exists.
- **Internal bigint `users.id` never leaves the server**; sessions expose `publicId` + `role` only (already enforced by `getSession`).
- **Customers are phone-first**: phone required, email + name optional. Staff (email+password) are seeded/invited, NOT created via public signup. Public `/signup` is customer-only.
- **Password policy:** min length 8 (config + zod `passwordSchema`). bcryptjs hashing unchanged.
- UI mirrors the committed `app/(auth)/login/login-form.tsx` (login-04 split-card): `Card`/`CardContent` two-column, brand panel right, react-hook-form + zod, show/hide password, generic error line.
- Commit after every task. No `Co-Authored-By` trailer.

---

### Task 1: Better Auth config hardening + `passwordSchema` in commons

**Files:**
- Modify: `apps/web/lib/auth/index.ts`
- Create: `packages/commons/src/util/password.ts` (+ export from the package index)
- Test: `packages/commons/src/util/__tests__/password.test.ts`

**Interfaces:**
- Produces: `passwordSchema` (zod) from `@tiffin/commons`: trims, min 8, max 256, returns the string. Used by every Phase A form.

- [ ] **Step 1: Write the failing passwordSchema test**

Create `packages/commons/src/util/__tests__/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { passwordSchema } from "../password";

describe("passwordSchema", () => {
  it("rejects shorter than 8", () => {
    expect(passwordSchema.safeParse("short12").success).toBe(false);
  });
  it("accepts 8+ and returns the value", () => {
    expect(passwordSchema.parse("hunter2!")).toBe("hunter2!");
  });
  it("rejects over 256", () => {
    expect(passwordSchema.safeParse("x".repeat(257)).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter @tiffin/commons exec vitest run src/util/__tests__/password.test.ts` (if the commons package lacks a vitest script, run from repo root: `pnpm --filter @tiffin/commons exec vitest run src/util/__tests__/password.test.ts`)
Expected: FAIL — module missing.

- [ ] **Step 3: Implement passwordSchema**

Create `packages/commons/src/util/password.ts`:

```ts
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(256, "Password is too long");
```

Export it from the commons entry (mirror how `contact.ts`'s `phoneSchema`/`emailSchema` are re-exported — find the barrel, e.g. `packages/commons/src/index.ts`, and add `export { passwordSchema } from "./util/password";` in the same style as the existing contact exports).

- [ ] **Step 4: Run it (GREEN)**

Run: `pnpm --filter @tiffin/commons exec vitest run src/util/__tests__/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Harden the Better Auth config**

In `apps/web/lib/auth/index.ts`, extend the `emailAndPassword` block (keep `enabled`, `password`, `sendResetPassword`):

```ts
  emailAndPassword: {
    enabled: true,
    password: betterAuthPassword,
    minPasswordLength: 8,
    maxPasswordLength: 256,
    requireEmailVerification: false, // customers are phone-first; email optional
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] password reset for ${user.email ?? user.id}: ${url}`);
    },
  },
```

Then ensure a new phone-verify CREATES a user (so signup works). **This requires verifying the installed plugin's behavior — do NOT blindly add a temp-email generator (it would pollute the nullable `email` column with fake addresses that surface in the account UI).** Check `node_modules/better-auth` plugin types for the phoneNumber `signUpOnVerification` option and whether user creation needs an email:

- **Preferred:** if the plugin can provision a phone user with a NULL email (our `email` column is nullable), enable signup-on-verify WITHOUT a `getTempEmail` (or with it returning the existing user's email / undefined). Do not inject placeholder emails.
- **Only if Better Auth genuinely requires a non-null email to create the user:** STOP and report this back rather than committing to fake emails — it's a product decision (require email at signup, vs. accept an internal placeholder the UI must treat as "no email"). Do not proceed to Task 3 on a guessed mechanism.

Add the verified-correct `signUpOnVerification` shape (whatever the installed version uses) alongside the existing `sendOTP` + `schema.user.fields` mapping, and document in your report exactly which option/shape worked and whether email-null phone signup is supported.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck` (expect 0 errors) and `pnpm --filter @tiffin/commons typecheck` if available.

```bash
git add packages/commons apps/web/lib/auth/index.ts
git commit -m "feat(auth): password policy + reset-token/session config; commons passwordSchema; phone signup-on-verify"
```

---

### Task 2: Logout control

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/account/account-form.tsx` (or the account page) — add a Sign out button
- Verify: `apps/web/components/dashboard/app-sidebar.tsx` (Task 7 of Phase 0 already re-pointed `signOut` here — confirm it works and redirects)

**Interfaces:**
- Consumes: `signOut` from `@/lib/auth/client`.

- [ ] **Step 1: Confirm the existing sidebar signOut**

Read `app-sidebar.tsx`. Confirm `signOut` is imported from `@/lib/auth/client` and called with a success redirect to `/login` (e.g. `await signOut(); router.push("/login")` or `signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })`). If it doesn't redirect, fix it to push `/login` on success.

- [ ] **Step 2: Add a Sign out button to the account Security area**

In the account page/Security section, add a client control:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => signOut({ fetchOptions: { onSuccess: () => { router.push("/login"); router.refresh(); } } })}
    >
      Sign out
    </Button>
  );
}
```

Render it on the account page.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter web typecheck`

```bash
git add apps/web/app apps/web/components
git commit -m "feat(auth): sign-out control on account; confirm sidebar signOut redirects to /login"
```

---

### Task 3: Customer signup wizard (`/signup`)

**Files:**
- Create: `apps/web/app/(auth)/signup/page.tsx`
- Create: `apps/web/app/(auth)/signup/signup-form.tsx`
- Create: `apps/web/app/(auth)/signup/__tests__/signup-form.test.tsx`

**Interfaces:**
- Consumes: `authClient` from `@/lib/auth/client` (`authClient.phoneNumber.sendOtp`, `authClient.phoneNumber.verify`, `authClient.setPassword`), `phoneSchema`/`emailSchema`/`passwordSchema` from `@tiffin/commons`, the committed `PhoneInput` (`@/components/ui/phone-input`).

**Flow (phone-first, OTP stubbed):** Step 1 — collect phone (required, `PhoneInput`), optional name/email, password (`passwordSchema`) → call `authClient.phoneNumber.sendOtp({ phoneNumber })`; advance to Step 2. Step 2 — enter the 6-digit code (logged to console in dev) → `authClient.phoneNumber.verify({ phoneNumber, code })` (creates + signs in the user) → `authClient.setPassword({ newPassword: password })` → if name/email provided, `authClient.updateUser({ name, email })` → `router.push("/dashboard"); router.refresh()`. Generic error messaging; never reveal existence.

- [ ] **Step 1: Write the failing render test**

Create `apps/web/app/(auth)/signup/__tests__/signup-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignupForm } from "../signup-form";

vi.mock("@/lib/auth/client", () => ({
  authClient: { phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() }, setPassword: vi.fn(), updateUser: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("SignupForm", () => {
  it("renders the phone step with a create-account action", () => {
    render(<SignupForm />);
    expect(screen.getByRole("button", { name: /send code|create account|continue/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter web exec vitest run "app/(auth)/signup/__tests__/signup-form.test.tsx"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the signup form**

Create `apps/web/app/(auth)/signup/signup-form.tsx` as a `"use client"` component. Use the committed `login-form.tsx` as the structural/style template (same `Card`/`CardContent` two-column split, brand panel right, RHF + zod, show/hide password, generic error `<p className="text-destructive text-sm">`). Two internal steps via `useState<"details" | "code">`.

- Step "details" form (zod schema: `phone` = `phoneSchema()` required, `email` = `emailSchema.optional()`, `name` optional, `password` = `passwordSchema`): on submit, `await authClient.phoneNumber.sendOtp({ phoneNumber: phone })`; on success store the form values + setStep("code"); on error set generic message.
- Step "code" form (zod: `code` = 6-digit string): on submit, `const v = await authClient.phoneNumber.verify({ phoneNumber, code })`; if `v.error` → generic "Invalid or expired code"; else `await authClient.setPassword({ newPassword: password })`, then if `email`/`name` present `await authClient.updateUser({ ...(email && { email }), ...(name && { name }) })`, then `router.push("/dashboard"); router.refresh()`.
- Add a "We sent a code to {phone}" helper line and a dev hint is NOT shown (code is server-logged only).
- Footer link "Already have an account? Sign in" → `Link href="/login"`.

Use `PhoneInput` for the phone field (see `account-form.tsx` for its usage + `defaultCountry`). For the OTP field use a plain `Input inputMode="numeric" maxLength={6}`.

Create `apps/web/app/(auth)/signup/page.tsx` mirroring `login/page.tsx`'s wrapper (`<main className="bg-muted flex min-h-svh ...">` + `max-w-sm md:max-w-3xl` + `<Suspense>`), rendering `<SignupForm />`.

- [ ] **Step 4: Run the test (GREEN)**

Run: `pnpm --filter web exec vitest run "app/(auth)/signup/__tests__/signup-form.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter web typecheck`

```bash
git add "apps/web/app/(auth)/signup"
git commit -m "feat(auth): customer signup wizard (phone OTP -> set password), login-04 styling"
```

---

### Task 4: Forgot password (`/forgot-password`) — dual path

**Files:**
- Create: `apps/web/app/(auth)/forgot-password/page.tsx`
- Create: `apps/web/app/(auth)/forgot-password/forgot-form.tsx`
- Create: `apps/web/app/(auth)/forgot-password/__tests__/forgot-form.test.tsx`

**Interfaces:**
- Consumes: `authClient` (`authClient.requestPasswordReset`, `authClient.phoneNumber.sendOtp`/`verify`, `authClient.setPassword`), `passwordSchema`/`phoneSchema`/`emailSchema`.

**Flow:** One `identifier` field. If `/@/`-email → `await authClient.requestPasswordReset({ email: identifier, redirectTo: \`${origin}/reset-password\` })` → show generic "If an account exists, a reset link has been sent." (link is server-logged). If phone → `await authClient.phoneNumber.sendOtp({ phoneNumber: identifier })` → switch to an inline reset step (enter code + new password → `authClient.phoneNumber.verify({ phoneNumber, code })` then `authClient.setPassword({ newPassword })` → "Password updated, please sign in" → `router.push("/login")`). Generic messaging on both branches; never reveal existence.

- [ ] **Step 1: Write the failing render test**

Create `apps/web/app/(auth)/forgot-password/__tests__/forgot-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForgotForm } from "../forgot-form";

vi.mock("@/lib/auth/client", () => ({
  authClient: { requestPasswordReset: vi.fn(), phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() }, setPassword: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("ForgotForm", () => {
  it("renders an identifier field and a submit action", () => {
    render(<ForgotForm />);
    expect(screen.getByRole("button", { name: /reset|continue|send/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter web exec vitest run "app/(auth)/forgot-password/__tests__/forgot-form.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement the forgot form**

Create `forgot-form.tsx` (`"use client"`), mirroring login-04 style. State machine: `"request" | "sent" | "phone-reset"`.
- "request" step: single `identifier` field (label "Phone or email"). On submit detect `/@/`: email branch → `requestPasswordReset({ email: identifier, redirectTo: \`${window.location.origin}/reset-password\` })` → setStep("sent"); phone branch → `phoneNumber.sendOtp({ phoneNumber: identifier })` → store phone → setStep("phone-reset"). Always show generic success copy (do not branch the visible message on existence).
- "sent" step: static "If an account exists for that email, we've sent a reset link." + link back to `/login`.
- "phone-reset" step: `code` (numeric, 6) + `newPassword` (`passwordSchema`) fields → `phoneNumber.verify({ phoneNumber, code })`; on success `setPassword({ newPassword })` → `router.push("/login")`; on error generic "Invalid or expired code".

Create `forgot-password/page.tsx` mirroring `login/page.tsx` wrapper.

- [ ] **Step 4: Run the test (GREEN)**

Run: `pnpm --filter web exec vitest run "app/(auth)/forgot-password/__tests__/forgot-form.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add "apps/web/app/(auth)/forgot-password"
git commit -m "feat(auth): forgot-password dual path (email reset link / phone OTP reset)"
```

---

### Task 5: Reset password (`/reset-password?token=…`)

**Files:**
- Create: `apps/web/app/(auth)/reset-password/page.tsx`
- Create: `apps/web/app/(auth)/reset-password/reset-form.tsx`
- Create: `apps/web/app/(auth)/reset-password/__tests__/reset-form.test.tsx`

**Interfaces:**
- Consumes: `authClient.resetPassword`, `passwordSchema`, `useSearchParams`.

**Flow:** Read `token` from the query (Better Auth's reset link redirects to `redirectTo?token=…`; if the link contains `error=INVALID_TOKEN`, show an expired-link message + link to `/forgot-password`). Form: `newPassword` + `confirm` (`passwordSchema`, must match). Submit → `await authClient.resetPassword({ newPassword, token })`; on success → "Password updated" → `router.push("/login")`; on error → generic "This reset link is invalid or has expired."

- [ ] **Step 1: Write the failing render test**

Create `apps/web/app/(auth)/reset-password/__tests__/reset-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResetForm } from "../reset-form";

vi.mock("@/lib/auth/client", () => ({ authClient: { resetPassword: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("token=abc"),
}));

describe("ResetForm", () => {
  it("renders new + confirm password and a submit action", () => {
    render(<ResetForm />);
    expect(screen.getByRole("button", { name: /reset|update|set/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter web exec vitest run "app/(auth)/reset-password/__tests__/reset-form.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement the reset form**

Create `reset-form.tsx` (`"use client"`), login-04 style. Read `const token = useSearchParams().get("token")`. If no token (or `error` param present) render an "invalid/expired link" card with a link to `/forgot-password`, no form. Otherwise: zod schema `{ newPassword: passwordSchema, confirm: z.string() }` refined so `newPassword === confirm` ("Passwords do not match"). Submit → `const r = await authClient.resetPassword({ newPassword, token })`; on `r.error` → generic invalid/expired message; on success → success copy + `router.push("/login")`. Include show/hide password toggles.

Create `reset-password/page.tsx` mirroring `login/page.tsx` wrapper, wrapping `<ResetForm />` in `<Suspense>` (it uses `useSearchParams`).

- [ ] **Step 4: Run the test (GREEN)**

Run: `pnpm --filter web exec vitest run "app/(auth)/reset-password/__tests__/reset-form.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add "apps/web/app/(auth)/reset-password"
git commit -m "feat(auth): reset-password page (token -> resetPassword), invalid-link handling"
```

---

### Task 6: Email verification page + resend control

**Files:**
- Create: `apps/web/app/(auth)/verify-email/page.tsx`
- Create: `apps/web/app/(auth)/verify-email/verify-status.tsx`
- Modify: the account page Contact section — add a "Resend verification email" control + a verified/unverified badge

**Interfaces:**
- Consumes: `authClient.sendVerificationEmail`, `getSession`/the account page's existing user load (for `emailVerified` + `email`).

**Flow:** Better Auth's verification link is a GET to `/api/auth/verify-email?token=…&callbackURL=/verify-email`. The handler verifies server-side and redirects to `callbackURL` (optionally with an error). So `/verify-email` is a landing page that reads the query for success/`error` and shows the outcome + a link to `/dashboard` or `/login`. Resend lives on the account page: `authClient.sendVerificationEmail({ email, callbackURL: \`${origin}/verify-email\` })` (link logged to console).

- [ ] **Step 1: Implement the verify-email landing page**

Create `verify-email/verify-status.tsx` (`"use client"`, uses `useSearchParams`): if an `error` query param is present → "Verification link invalid or expired" + a button that calls a passed `onResend` or links to `/dashboard`; else → "Your email is verified." + link to `/dashboard`. Create `verify-email/page.tsx` mirroring `login/page.tsx` wrapper with `<Suspense>` around `<VerifyStatus />`.

- [ ] **Step 2: Add resend + verified badge to the account Contact section**

In the account page (server component) read the user's `email` + `emailVerified`. Render a shadcn `Badge` — "Verified" when `emailVerified`, else "Unverified" — next to the email field, plus a client "Resend verification email" button (shown only when an email exists and is unverified):

```tsx
"use client";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ResendVerification({ email }: { email: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await authClient.sendVerificationEmail({ email, callbackURL: `${window.location.origin}/verify-email` });
        toast.success("Verification email sent (check the server log in dev).");
      }}
    >
      Resend verification email
    </Button>
  );
}
```

If the account page lacks a `Badge` component, add it: `pnpm dlx shadcn@latest add badge -c apps/web` — and if it prompts to overwrite any existing file, answer NO (do not clobber customized components); only the new `badge.tsx` should be written.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter web typecheck`

```bash
git add "apps/web/app/(auth)/verify-email" apps/web/app apps/web/components
git commit -m "feat(auth): email verification landing + resend control + verified badge"
```

---

### Task 7: Gate + integration check

**Files:**
- Verify only (no new files expected); fix any straggler.

- [ ] **Step 1: Confirm the login-page links now resolve**

The committed login page links to `/signup` and `/forgot-password`. Confirm both routes now exist and render. `git grep -n "/forgot-password\|/signup\|/reset-password\|/verify-email" -- 'apps/web/app/**'`.

- [ ] **Step 2: Full gate**

Run, and report exact results:
- `pnpm --filter web typecheck` → 0 errors.
- `pnpm --filter web exec vitest run` → all pass (the `db/__tests__/next-id.test.ts` concurrency flake passes in isolation — if ONLY that fails, note it, not a blocker).
- `pnpm --filter web lint` → no NEW issues.
- `pnpm --filter web build` → succeeds (the new `(auth)` pages compile).

- [ ] **Step 3: Manual runbook (document, DB-dependent — do NOT block on it here)**

Document in the report: with a seeded DB + `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` set and `pnpm --filter web dev` running — (a) `/signup`: enter a phone → read the OTP from the server log → enter code + password → lands on `/dashboard`; (b) `/forgot-password` with a phone → OTP reset → sign in with the new password; (c) email user reset → read the reset link from the log → `/reset-password` → sign in; (d) account → resend verification → read link from log → `/verify-email` shows verified.

- [ ] **Step 4: Commit (if any straggler fixes)**

```bash
git add apps/web
git commit -m "chore(auth): phase A integration check; login links resolve; gate green"
```

---

## Self-Review

- **Spec coverage:** signup phone-first (T3) · logout (T2) · password reset/set dual-path (T4,T5) · email verify + resend (T6) · password policy + token config (T1) · `passwordSchema` in commons (T1) · login-link resolution (T7). PIN (Phase C) and avatar/profile-tabs (Phase B) are explicitly out of scope.
- **Placeholders:** none — auth-client call sequences are concrete; UI references the committed `login-form.tsx` template (DRY) rather than re-pasting identical styling, with each form's distinct fields/logic fully specified.
- **Type consistency:** `passwordSchema` defined T1, consumed T3/T4/T5; `authClient.phoneNumber.sendOtp`/`verify` + `setPassword` used consistently across T3/T4; `requestPasswordReset`/`resetPassword` across T4/T5.
- **Integration risk flagged:** T1 Step 5 requires confirming the installed phoneNumber plugin's `signUpOnVerification` option before T3 relies on phone-verify provisioning a user — STOP-and-report if absent.

## Follow-on
- **Phase B** — profile + avatar (storage abstraction + local stub) + account tabs.
- **Phase C** — 4-digit PIN re-unlock.
