# Scaffold checklist

Gold original: `apps/xplorers`. Diff against it after the rename pass.

## App package

- `apps/<slug>/package.json` — `"name": "<slug>"`, `dev` port unused by other apps (xplorers is 3002)
- `apps/<slug>/.env.example` + `.env.local` (never commit secrets)
- `next.config.ts` — `transpilePackages` (see Foundry `next-foundry-app`)
- `app/globals.css` — `@source` of `node_modules/@foundry/*/src`; brand tokens; `.crm-app` for admin
- `proxy.ts` — gate `/dashboard`, `/me`, `/no-access`; public `/api/auth`

## Auth (see Foundry `foundry-auth`)

- `lib/auth/index.ts` — `appName`, dedicated plugin imports, `disableSignUp` on email+password **and** emailOTP, `ipAddressHeaders: ["x-real-ip"]`, `freshAge: 60 * 60`, `revokeSessionsOnPasswordReset`, `onPasswordReset` → `passwordSet: true`
- `lib/auth/client.ts` — `emailOTPClient` from `better-auth/client/plugins`
- `lib/auth/permissions.ts` — `baseStatement` + `createAccessControl` from `@foundry/auth`
- `lib/auth/session.ts` / `landing.ts` / `guards.ts` / `proxy.ts`
- Auth UI wrappers in `components/auth/` wrapping `@foundry/auth-ui` (`ChangePasswordForm`, `ChangeEmailForm`, `ForgotPasswordForm`, `CodeOtp`)
- Dashboard account and `/me/account` both import those wrappers (do not reach across route groups)
- Custom `signUpCustomer` for `user` role; staff invited via `@foundry/crm` `UserInviteDialog`

## Data

- Schema: `app`, `users`, `account`, `session`, `verification`, `organization`, `member`, `invitation`, `audit_log`
- `db/migrations/0000_baseline.sql` must include `id_seq`, `next_id()`, `current_app_id()`
- `db/seed-admin.ts`, `db/seed-brand-org.ts`
- Users `role` defaults to `user` (fail-closed)

## Surfaces

- Marketing: `/`, plus whatever public pages the brief needs
- CRM: `CrmShell` slots only — nav, breadcrumbs, brand, actions, bottom nav injected
- Customer: `/me` home + `/me/account` with `Suspense` + skeleton like dashboard account
- Login `useSearchParams` wrapped in `Suspense` at the page

## Repo docs / CI

- `.github/workflows/ci.yml` typecheck `--filter=<slug>`
- `PROJECT.md`, `AGENTS.md`, `EXTRACTION.md`, app `README.md`
- `konsistent.json` app list if present

## Verify

```bash
pnpm turbo typecheck --filter=<slug>...
pnpm --filter <slug> test
```

Browser, not only a screenshot: public page, admin first login, dashboard users invite, family signup, customer `/dashboard` redirect.
